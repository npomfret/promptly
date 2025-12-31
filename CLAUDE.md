# Promptly

A multi-project prompt enhancement server using Gemini AI with context caching.

## Project Structure

```
src/
  server.ts      - Main Express server with all routes
  auth.ts        - Firebase authentication middleware
  projectManager.ts - Git repository management and project config
  repoWatcher.ts - Automatic repository update polling
  types.ts       - TypeScript type definitions

views/           - HTML templates (HTMX-powered)
public/
  js/auth.js     - Firebase client-side authentication
  js/ui.js       - UI utilities
  css/style.css  - Glass-panel UI styles

config/private/  - Firebase credentials (not in repo)
```

## Key Technologies

- **Backend**: Express.js with TypeScript (tsx)
- **Frontend**: HTMX + Vanilla JS (no build step)
- **AI**: Google Gemini 2.5 Flash with context caching
- **Auth**: Firebase Authentication
- **Deployment**: Docker behind nginx reverse proxy

## Running Locally

```bash
npm run dev      # Development with watch mode
npm start        # Production mode
```

## Deployment

```bash
./deploy.sh      # Full automated deployment
```

Or manual steps:
```bash
git push origin main
ssh root@promptly.snowmonkey.co.uk "cd /opt/promptly && git pull && docker build -t promptly:latest . && docker stop promptly && docker rm promptly && docker compose up -d"
```

Note: Server has older buildx version, so use `docker build` directly instead of `docker-compose build`.

Required environment variables (see `.env.example`):
- `GEMINI_API_KEY` - Google AI API key
- `CHECKOUT_DIR` - Directory for cloned repositories
- `HISTORY_DIR` - Optional: Directory for chat history logs

## API Routes

All `/api/*` routes require Firebase authentication (Bearer token or session).

- `POST /api/projects` - Add a new project (HTMX, returns HTML)
- `DELETE /api/projects/:id` - Remove a project
- `POST /api/chat-message` - Send enhance message
- `POST /api/ask-message` - Send ask message
- `GET /api/projects-table` - Get projects list HTML

## Troubleshooting

### Checking Server Logs

**Local development:**
```bash
npm run dev
# Logs appear in terminal
```

**Docker deployment:**
```bash
docker logs promptly --tail 100
docker logs promptly -f  # Follow logs
```

**Remote deployment:**
SSH to server, then use docker logs or check `/var/log/` depending on setup.

### Common Issues

#### 400 Error on Add Project

The `/api/projects` endpoint returns 400 only for:
1. **Missing `gitUrl`** - Check that the form field name is `gitUrl` and the request body is being parsed
2. **Access token with non-HTTPS URL** - Personal access tokens require `https://` URLs

**Debug steps:**
1. Check browser Network tab - look at request payload and response body
2. Server logs show `[DEBUG] POST /api/projects` with received field values
3. Verify `Content-Type: application/x-www-form-urlencoded` header is present

#### 401 Unauthorized

- Firebase token expired or missing
- Session not synced - check `/api/auth/session` POST succeeded
- Check browser console for `[AUTH]` errors

#### 429 Too Many Requests

Rate limiting: max 3 project additions per 5 minutes per IP.

#### Form Errors Not Displaying

HTMX forms need proper error handling:
- Use `hx-target` to specify where errors should appear
- Error responses (4xx) are swapped by default in HTMX 1.9+
- Check that the target element exists in the DOM

#### Cache/Session Issues

- Sessions expire after 24 hours
- Gemini cache TTL is 1 hour (auto-refreshed)
- Clear session: POST to `/api/session/clear?projectId=ID`
- Refresh cache: POST to `/cache/refresh?projectId=ID`

### Debug Logging

Key log prefixes:
- `[DEBUG]` - Detailed operation info
- `[WARN]` - Validation failures, non-fatal issues
- `[ERROR]` - Operation failures
- `[AUTH]` - Authentication events
- `[✓]` - Successful operations
- `[...]` - Operations in progress

### Testing API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Add project (requires auth token)
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "gitUrl=https://github.com/user/repo.git&branch=main"
```

### HTMX Form Debugging

1. Open browser DevTools > Network tab
2. Submit form and look for the POST request
3. Check:
   - Request payload (form data being sent)
   - Response status and body
   - Response headers

Common HTMX issues:
- Missing `hx-target` causes response to replace the triggering element
- Auth tokens added via `htmx:configRequest` event in `auth.js`
- Forms with `data-auth-guard="true"` redirect to login on 401
