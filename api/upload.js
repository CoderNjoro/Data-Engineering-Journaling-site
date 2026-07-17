// ============================================================
// api/upload.js — Commit uploaded files directly to GitHub
// ============================================================

const REPO_OWNER = 'CoderNjoro';
const REPO_NAME = 'Data-Engineering-Journaling-site';
const BRANCH = 'main';

module.exports = async function handler(req, res) {
    // ── CORS ─────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        return res.status(500).json({ error: 'Server not configured. GITHUB_TOKEN environment variable is missing.' });
    }

    // Verify admin credentials
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass  = process.env.ADMIN_PASS;

    if (!adminEmail || !adminPass) {
        return res.status(500).json({ error: 'Admin credentials not configured on server.' });
    }

    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized. Admin credentials required.' });
    }

    const base64Auth = authHeader.slice(6);
    let email, pass;
    try {
        const decoded = Buffer.from(base64Auth, 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        email = decoded.slice(0, colonIdx);
        pass  = decoded.slice(colonIdx + 1);
    } catch {
        return res.status(401).json({ error: 'Invalid authorization format.' });
    }

    if (email !== adminEmail || pass !== adminPass) {
        return res.status(403).json({ error: 'Invalid admin credentials.' });
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }

        const { fileName, fileType, fileData } = body; // fileData is base64 string
        if (!fileName || !fileData) {
            return res.status(400).json({ error: 'Missing fileName or fileData.' });
        }

        // Clean filename to prevent path traversal or bad characters
        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const timestamp = Date.now();
        const repoPath = `data/resources/${timestamp}_${safeName}`;

        // Commit directly to GitHub using API
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`;
        const cleanBase64 = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'Vercel-Upload'
            },
            body: JSON.stringify({
                message: `media: upload ${safeName} via DE Journal`,
                content: cleanBase64,
                branch: BRANCH
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('GitHub Upload Error:', err);
            return res.status(response.status).json({ error: 'Failed to upload to GitHub.', details: err });
        }

        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${repoPath}`;
        return res.status(200).json({ success: true, url: rawUrl, fileName: safeName });

    } catch (e) {
        console.error('Upload handler error:', e);
        return res.status(500).json({ error: 'Internal server error.', message: e.message });
    }
};
