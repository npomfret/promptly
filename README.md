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

## Deployment Scripts

| Script | Purpose |
|--------|---------|
| `./deploy.sh` | Full deployment to server |
| `./scripts/status.sh` | Check health and container status |
| `./scripts/logs.sh` | Stream live logs |
| `./scripts/restart.sh` | Restart without rebuild |
| `./scripts/rebuild.sh` | Rebuild image and restart |
| `./scripts/update-env.sh` | Push `.env` changes to server |
| `./scripts/update-projects.sh` | Push `projects.json` to server |
| `./scripts/backup.sh` | Download server data to `./backups/` |

## License
ISC
