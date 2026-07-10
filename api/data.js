// ============================================================
// api/data.js — GitHub API data proxy for DE Journal
// ============================================================
// Environment variables required:
//   GITHUB_TOKEN    — Personal Access Token with repo scope
//   ADMIN_EMAIL     — Your admin login email
//   ADMIN_PASS      — Your admin login password
// ============================================================

const REPO_OWNER = 'CoderNjoro';
const REPO_NAME = 'Data-Engineering-Journaling-site';
const PATH = 'data/journal.json';
const BRANCH = 'main';

module.exports = async function handler(req, res) {
    // ── CORS ─────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Only');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        return res.status(500).json({
            error: 'Server not configured. Set GITHUB_TOKEN in Vercel environment variables.'
        });
    }

    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PATH}`;
    const headers = {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-App'
    };

    // ── GET: read from GitHub ────────────────────────────────
    if (req.method === 'GET') {
        try {
            const response = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers });

            if (response.status === 404) {
                // If file doesn't exist yet, return empty default schema
                return res.status(200).json({ profile: {}, settings: {}, entries: [], resources: [], phases: [] });
            }

            if (!response.ok) {
                const err = await response.text();
                console.error('GitHub GET error:', err);
                return res.status(response.status).json({ error: 'Failed to fetch data from GitHub.', details: err });
            }

            const json = await response.json();
            const content = Buffer.from(json.content, 'base64').toString('utf8');
            return res.status(200).json(JSON.parse(content));
        } catch (e) {
            console.error('GET handler error:', e);
            return res.status(500).json({ error: 'Internal server error.', message: e.message });
        }
    }

    // ── POST: admin-protected write to GitHub ────────────────
    if (req.method === 'POST') {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPass  = process.env.ADMIN_PASS;

        if (!adminEmail || !adminPass) {
            return res.status(500).json({ error: 'Admin credentials not configured on server.' });
        }

        // Verify admin credentials
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
            pass  = decoded.slice(colonIdx + 1);
        } catch {
            return res.status(401).json({ error: 'Invalid authorization format.' });
        }

        if (email !== adminEmail || pass !== adminPass) {
            return res.status(403).json({ error: 'Invalid admin credentials.' });
        }

        // Login check only
        if (req.headers['x-verify-only'] === 'true') {
            return res.status(200).json({ verified: true });
        }

        try {
            let body = req.body;
            if (typeof body === 'string') {
                body = JSON.parse(body);
            }
            const newContentBase64 = Buffer.from(JSON.stringify(body, null, 2)).toString('base64');

            // 1. Get current SHA of the file
            let currentSha = null;
            let getStatus = 'not attempted';
            let tokenScopes = 'unknown';
            const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers });
            getStatus = `${getRes.status} ${getRes.statusText}`;
            tokenScopes = getRes.headers.get('x-oauth-scopes') || 'none';
            if (getRes.ok) {
                const getJson = await getRes.json();
                currentSha = getJson.sha;
            }

            // 2. Commit the new file
            const putRes = await fetch(apiUrl, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: "chore: update journal data via admin panel",
                    content: newContentBase64,
                    sha: currentSha,
                    branch: BRANCH
                })
            });

            if (!putRes.ok) {
                const err = await putRes.text();
                const putScopes = putRes.headers.get('x-oauth-scopes') || 'none';
                console.error('GitHub PUT error:', err);
                return res.status(putRes.status).json({
                    error: 'Failed to commit to GitHub.',
                    details: err,
                    debug: { getStatus, tokenScopes, putScopes, sha: currentSha, apiUrl }
                });
            }

            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('POST handler error:', e);
            return res.status(500).json({ error: 'Internal server error.', message: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed.' });
};
