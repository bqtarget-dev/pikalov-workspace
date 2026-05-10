const JSONBIN = 'https://api.jsonbin.io/v3';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

async function readBin(binId) {
  try {
    const res = await fetch(`${JSONBIN}/b/${binId}/latest`, {
      headers: { 'X-Master-Key': MASTER_KEY }
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[readBin] JSONBin error', res.status, text);
      return {};
    }
    const data = await res.json();
    return data.record || {};
  } catch (e) {
    console.error('[readBin] fetch failed', e.message);
    return {};
  }
}

async function writeBin(binId, value) {
  try {
    const res = await fetch(`${JSONBIN}/b/${binId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': MASTER_KEY },
      body: JSON.stringify(value)
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[writeBin] JSONBin error', res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[writeBin] fetch failed', e.message);
    return false;
  }
}

async function createBin() {
  try {
    const res = await fetch(`${JSONBIN}/b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': MASTER_KEY,
        'X-Bin-Name': 'pikalov-workspace-mediaplans',
        'X-Bin-Private': 'true'
      },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[createBin] JSONBin error', res.status, text);
      return null;
    }
    const data = await res.json();
    return data.metadata?.id || null;
  } catch (e) {
    console.error('[createBin] fetch failed', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!MASTER_KEY) {
    return res.status(503).json({ error: 'JSONBIN_MASTER_KEY not set in Vercel env vars' });
  }

  // GET /api/save?key=project_XXX&bid=YYY
  if (req.method === 'GET') {
    const { key, bid } = req.query;
    if (!key) return res.status(400).json({ error: 'key required' });
    if (!bid)  return res.status(400).json({ error: 'bid required' });

    const store = await readBin(bid);
    const data = store[key];
    if (data === undefined) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ data });
  }

  // POST /api/save — body: {key, data, bid?}
  if (req.method === 'POST') {
    const body = req.body || {};
    const { key, data, bid: bodyBid } = body;
    if (!key || data === undefined) {
      return res.status(400).json({ error: 'key and data required' });
    }

    let binId = bodyBid || null;

    if (!binId) {
      binId = await createBin();
      if (!binId) return res.status(500).json({ error: 'Failed to create JSONBin' });
      console.log('[POST /api/save] created new bin', binId);
    }

    const store = await readBin(binId);
    store[key] = data;
    const ok = await writeBin(binId, store);
    if (!ok) console.error('[POST /api/save] writeBin failed for bin', binId);

    return res.status(ok ? 200 : 500).json({ ok, bin_id: binId });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
