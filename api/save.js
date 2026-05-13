const JSONBIN = 'https://api.jsonbin.io/v3';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

async function readBin(binId) {
  const res = await fetch(`${JSONBIN}/b/${binId}/latest`, {
    headers: { 'X-Master-Key': MASTER_KEY }
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[readBin] error', res.status, text.slice(0, 200));
    throw new Error(`readBin ${res.status}`);
  }
  const data = await res.json();
  return data.record || {};
}

async function writeBin(binId, value) {
  const res = await fetch(`${JSONBIN}/b/${binId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': MASTER_KEY },
    body: JSON.stringify(value)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[writeBin] error', res.status, text.slice(0, 200));
    throw new Error(`writeBin ${res.status}`);
  }
  return true;
}

// Creates a new bin with initialData already written — saves one round-trip vs create({}) + write.
async function createBin(initialData) {
  const res = await fetch(`${JSONBIN}/b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': MASTER_KEY,
      'X-Bin-Name': 'pikalov-workspace-mediaplans',
      'X-Bin-Private': 'true'
    },
    body: JSON.stringify(initialData || {})
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[createBin] error', res.status, text.slice(0, 200));
    throw new Error(`createBin ${res.status}`);
  }
  const data = await res.json();
  const id = data.metadata?.id || null;
  console.log('[createBin] created bin', id);
  return id;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!MASTER_KEY) {
    console.error('[handler] JSONBIN_MASTER_KEY not set');
    return res.status(503).json({ error: 'JSONBIN_MASTER_KEY not set in Vercel env vars' });
  }

  // ── GET /api/save?key=project_XXX&bid=YYY ────────────────────────────
  if (req.method === 'GET') {
    const { key, bid } = req.query;
    console.log('[GET] key:', key, 'bid:', bid);
    if (!key) return res.status(400).json({ error: 'key required' });
    if (!bid) return res.status(400).json({ error: 'bid required' });

    try {
      const store = await readBin(bid);
      const data = store[key];
      if (data === undefined) {
        console.warn('[GET] key not found in bin:', key);
        return res.status(404).json({ error: 'not_found' });
      }
      console.log('[GET] ok, key:', key);
      return res.status(200).json({ ok: true, data });
    } catch (e) {
      console.error('[GET] failed:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST /api/save  body: { key, data, bid? } ────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const { key, data, bid: bodyBid } = body;
    console.log('[POST] key:', key, 'bid:', bodyBid || '(none — will create)');

    if (!key || data === undefined) {
      return res.status(400).json({ error: 'key and data required' });
    }

    try {
      let binId = bodyBid || null;

      if (!binId) {
        // First save — create the bin with the data already inside (1 round-trip).
        binId = await createBin({ [key]: data });
        console.log('[POST] new bin created:', binId);
        return res.status(200).json({ ok: true, bin_id: binId });
      }

      // Existing bin — read → merge key → write (2 round-trips).
      console.log('[POST] reading existing bin', binId);
      const store = await readBin(binId);
      store[key] = data;
      await writeBin(binId, store);
      console.log('[POST] bin updated:', binId, 'key:', key);
      return res.status(200).json({ ok: true, bin_id: binId });

    } catch (e) {
      console.error('[POST] failed:', e.message);
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
