// ============================================================
// api/data.js — Cloud data proxy for DE Journal
// ============================================================
// Environment variables required (set in Vercel dashboard):
//   JSONBIN_API_KEY   — Your JSONBin.io master API key
//   JSONBIN_ID        — The ID of your JSONBin bin
//   ADMIN_EMAIL       — Your admin login email
//   ADMIN_PASS        — Your admin login password
// ============================================================

const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

module.exports = async function handler(req, res) {
    // ── CORS ─────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Only');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const apiKey = process.env.JSONBIN_API_KEY;
    const binId  = process.env.JSONBIN_ID;

    if (!apiKey || !binId) {
        return res.status(500).json({
            error: 'Server not configured. Set JSONBIN_API_KEY and JSONBIN_ID in Vercel environment variables.'
        });
    }

    // ── GET: public read ──────────────────────────────────────
    if (req.method === 'GET') {
        try {
            const response = await fetch(`${JSONBIN_BASE}/${binId}/latest`, {
                headers: {
                    'X-Master-Key': apiKey,
                    'X-Bin-Meta': 'false'
                }
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('JSONBin GET error:', err);
                return res.status(response.status).json({ error: 'Failed to fetch data from cloud.' });
            }

            const data = await response.json();
            return res.status(200).json(data);
        } catch (e) {
            console.error('GET handler error:', e);
            return res.status(500).json({ error: 'Internal server error.', message: e.message });
        }
    }

    // ── POST: admin-protected write (or verify-only login) ────
    if (req.method === 'POST') {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPass  = process.env.ADMIN_PASS;

        if (!adminEmail || !adminPass) {
            return res.status(500).json({ error: 'Admin credentials not configured on server.' });
        }

        // Verify admin credentials from Authorization header (Basic auth)
        const authHeader = req.headers['authorization'] || '';
        if (!authHeader.startsWith('Basic ')) {
            return res.status(401).json({ error: 'Unauthorized. Admin credentials required.' });
        }

        const base64 = authHeader.slice(6);
        let email, pass;
        try {
            const decoded = Buffer.from(base64, 'base64').toString('utf8');
            const colonIdx = decoded.indexOf(':');
            email = decoded.slice(0, colonIdx);
            pass  = decoded.slice(colonIdx + 1); // allow colons in password
        } catch {
            return res.status(401).json({ error: 'Invalid authorization format.' });
        }

        if (email !== adminEmail || pass !== adminPass) {
            return res.status(403).json({ error: 'Invalid admin credentials.' });
        }

        // Login check only — do NOT overwrite cloud data on sign-in
        if (req.headers['x-verify-only'] === 'true') {
            return res.status(200).json({ verified: true });
        }

        // Write new data to JSONBin
        try {
            let body = req.body;
            if (typeof body === 'string') {
                body = JSON.parse(body);
            }

            const response = await fetch(`${JSONBIN_BASE}/${binId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': apiKey
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('JSONBin PUT error:', err);
                return res.status(response.status).json({ error: 'Failed to save data to cloud.' });
            }

            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('POST handler error:', e);
            return res.status(500).json({ error: 'Internal server error.', message: e.message });
        }
    }

    // ── Method not allowed ────────────────────────────────────
    return res.status(405).json({ error: 'Method not allowed.' });
};
