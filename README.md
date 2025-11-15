# Promptly - Gemini Session Server

Long-lived Express server that keeps Gemini 2.5 Flash sessions warm with real project context.

## Local Development

### Requirements
- Node.js 18+
- Google Gemini API key ([get one here](https://ai.google.dev/))
- `projects.json` describing repos to load

### Setup
```bash
cp .env.example .env
```

Edit `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

Copy your Firebase service account JSON into `config/private/serviceAccountKey.json` (the standard download from **Project Settings → Service Accounts**).

```json
{
  "type": "service_account",
  "project_id": "promptly-prod",
  "private_key_id": "abc123",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk@promptly-prod.iam.gserviceaccount.com",
  "client_id": "1234567890"
}
```

For the browser SDK, create `config/private/firebaseWebConfig.json` (copy `config/private/firebaseWebConfig.example.json`) and paste the Web app credentials from **Project Settings → General → Your apps**:

```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "promptly-prod.firebaseapp.com",
  "appId": "1:123:web:456",
  "messagingSenderId": "1234567890"
}
```

If you keep either file outside this repo, symlink them into the `config/private/` directory so deployments can copy them alongside the app.

> **Deployment note:** `deploy.sh` now copies the entire `config/` directory to the server before building Docker images, and the `Dockerfile` bakes `config/private/serviceAccountKey.json` into the runtime image. Make sure the symlink points to a real file (or copy the JSON directly) prior to running any Docker build or deploy, otherwise the build will fail.

Edit `projects.json`:
```json
{
  "projects": [
    {
      "gitUrl": "https://github.com/user/repo.git",
      "branch": "main"
    }
  ]
}
```

### Run
```bash
npm install
npm run dev          # development with hot reload
npm start            # production
npm run type-check   # TypeScript validation
```

### Firebase Authentication

Promptly now requires Firebase Authentication for every API call.

1. Create (or reuse) a Firebase project and enable your preferred auth providers (e.g., Google, email/password) inside **Build → Authentication**.
2. Download a service-account key (JSON) from **Project Settings → Service Accounts**, then drop/symlink it at `config/private/serviceAccountKey.json`. Promptly reads this file at runtime—no environment variables required.
3. In **Project Settings → General → Your apps**, copy the Web SDK config (API key, auth domain, app ID, messaging sender ID) into `config/private/firebaseWebConfig.json`.
4. When the server starts you must sign in via the browser UI (Google popup) before any HTMX requests fire. Successful sign-in also provisions an Express session so server-rendered routes like `/enhance/:projectId` stay protected.
5. Prefer email + password? Visit `/register` to create an account or `/login` to sign in with those credentials. Both pages sync your Firebase session with the Express server automatically.

The `/enhance` and `/ask` API endpoints are now public (no authentication required):

```bash
curl -X POST "http://localhost:3000/enhance/YOUR_PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"message":"Ship mode?!"}'
```

Other endpoints (project management, etc.) still require authentication via Firebase ID token or browser session.

## Private Repositories

Store Personal Access Tokens separately in `projects.json`:

```json
{
  "projects": [
    {
      "gitUrl": "https://github.com/user/private-repo.git",
      "branch": "main",
      "accessToken": "github_pat_xxxxxxxxxxxx"
    }
  ]
}
```

At runtime, tokens are injected as `https://TOKEN@github.com/user/repo.git` when cloning/fetching.

**Steps:**
1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens)
2. For fine-grained tokens: grant access to specific repositories
3. Add `accessToken` field to project in `projects.json`
4. Deploy: `./scripts/update-projects.sh`

## Production Architecture

Promptly runs on `promptly.snowmonkey.co.uk` behind a centralized nginx reverse proxy ([snowmonkey-proxy-common](https://github.com/npomfret/snowmonkey-proxy-common)):

```
snowmonkey-proxy (nginx) → promptly container
         ↓
  snowmonkey-proxy-network (shared Docker network)
```

The reverse proxy handles:
- SSL/TLS termination
- Domain-based routing
- WebSocket support
- Shared by multiple applications

## Deployment

### Full Deployment

Deploy code, rebuild image, and restart:

```bash
./deploy.sh
```

This will:
1. Copy all source files to server (`/opt/promptly`)
2. Build Docker image on server
3. Restart containers with new image
4. Connect to `snowmonkey-proxy-network` automatically

### Rebuild Only

If files are already on the server and you just need to rebuild:

```bash
./scripts/rebuild.sh
```

This rebuilds the Docker image on the server using existing files and restarts containers.

## Deployment Scripts

| Script | Purpose |
|--------|---------|
| `./deploy.sh` | **Full deployment** - copies files, rebuilds, restarts |
| `./scripts/rebuild.sh` | **Rebuild only** - rebuilds Docker image on server (no file copy) |
| `./scripts/status.sh` | Check health and container status |
| `./scripts/logs.sh` | Stream live logs |
| `./scripts/restart.sh` | Restart containers without rebuild |
| `./scripts/update-env.sh` | Push `.env` changes to server |
| `./scripts/update-projects.sh` | Push `projects.json` to server |
| `./scripts/backup.sh` | Download server data to `./backups/` |

## License
ISC
