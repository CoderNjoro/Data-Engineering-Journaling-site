# DE Journal — Data Engineering Learning Tracker

A personal learning journal for tracking daily progress, curriculum phases, resources, and study analytics. All profile data and journal entries are stored in the cloud (JSONBin.io) — nothing personal is hardcoded in the source code.

## Deploy to Vercel

1. **Push this repo to GitHub** and import it in [Vercel](https://vercel.com).

2. **Create a JSONBin.io account** at [jsonbin.io](https://jsonbin.io):
   - Create a new bin with this empty starter content: `{}`
   - Copy your **Master Key** (X-Master-Key) and **Bin ID**

3. **Set environment variables** in Vercel → Project → Settings → Environment Variables:

   | Variable | Value |
   |----------|-------|
   | `JSONBIN_API_KEY` | Your JSONBin master key |
   | `JSONBIN_ID` | Your JSONBin bin ID |
   | `ADMIN_EMAIL` | `admin@dejournal.com` (or your email) |
   | `ADMIN_PASS` | `ChangeMe123!` (change after first login) |

   See `.env.example` for the full list including optional EmailJS vars.

4. **Redeploy** after adding env vars (Vercel → Deployments → Redeploy).

5. **Sign in as admin**: open your site and press **Ctrl+Shift+A**, then use the credentials from step 3.

6. **Update your profile** in Settings — name, bio, skills, location, and all journal entries sync to the cloud and appear for all visitors.

## Local development

```bash
npm i -g vercel
cp .env.example .env.local
# Edit .env.local with your JSONBin keys and admin credentials
vercel dev
```

Open `http://localhost:3000`. The API routes require `vercel dev` — opening `index.html` directly will not load cloud data.

## Migrating old local data

If you used an earlier version that saved to browser localStorage, your journals are recovered automatically on the next page load. Sign in as admin once to sync them to the cloud.

## Admin credentials

Admin email and password are **not** stored in the codebase. They live only in Vercel environment variables. To reset them, update `ADMIN_EMAIL` and `ADMIN_PASS` in the Vercel dashboard and redeploy.
