# Team Workstation Social Backend - Quick Start

✓ **Phase 1 Complete**: Backend foundation is ready to connect to your real X account!

## What's Implemented

- ✅ Express.js server with OAuth 2.0 flow
- ✅ Encrypted token storage (AES-256-GCM)
- ✅ File-based data persistence (no database complications)
- ✅ Social account connection & disconnection
- ✅ Action approval workflow (proposed → approved → published)
- ✅ Audit logging for compliance
- ✅ Market signal caching
- ✅ User session management
- ✅ CORS configured for frontend

## Getting Started

### 1. Start the Backend Server

```bash
cd backend
npm start
```

Server will run on `http://localhost:8787`

### 2. Get X (Twitter) OAuth Credentials

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new app or use existing one
3. Go to "Keys and tokens" → "API Keys"
4. Copy the API Key and API Key Secret
5. In the app settings, set "OAuth 2.0 Redirect URI" to:
   ```
   http://localhost:8787/api/social/oauth/x/callback
   ```

### 3. Configure Backend `.env`

Edit `backend/.env` and set:
```
X_API_KEY=your_api_key_here
X_API_SECRET=your_api_secret_here
```

### 4. Configure Frontend 

In [f&n1.html](../f&n1.html), the social connector will automatically detect the backend at:
```
http://127.0.0.1:8787
```

Open the dashboard → Social tab → Enter X account → Click "Connect X"

## Data Storage

All data is stored in `backend/data/store.json`:
- Connected social accounts (encrypted tokens)
- Proposed actions (awaiting approval)
- Audit logs
- Market signals cache

**DO NOT COMMIT THIS FILE** — Contains encrypted tokens

## API Endpoints

**OAuth**
- `POST /api/social/oauth/x/start` → Get auth URL
- `POST /api/social/oauth/x/callback` → Handle OAuth callback

**Accounts**
- `GET /api/social/accounts` → List connected accounts
- `DELETE /api/social/accounts/:accountId` → Disconnect account

**Actions**
- `POST /api/social/actions` → Create action proposal
- `GET /api/social/actions` → List pending actions
- `POST /api/social/actions/:id/approve` → Approve & execute
- `POST /api/social/actions/:id/reject` → Reject proposal

**Market Signals**
- `GET /api/social/market-signals` → Get account metrics
- `POST /api/social/market-signals/update` → Update metrics

## Next Phase: Real X Integration

Phase 2 will implement:
- Real X API token exchange (currently uses mock tokens for testing)
- Real user profile fetching
- Real account metrics ingestion
- Tweet creation endpoint

## Development

### Start with watch mode (auto-restart on changes):
```bash
npm run dev
```

### Check backend health:
```bash
curl http://localhost:8787/health
```

### View stored data:
```bash
cat backend/data/store.json | jq
```

## Troubleshooting

**"ENCRYPTION_KEY must be 64-character hex string"**
→ The .env file already has a valid key. If you regenerate it:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**"Cannot connect to backend"**
→ Check that backend is running on port 8787
→ Verify CORS origin matches frontend URL in .env

**"OAuth fails immediately"**
→ Ensure X_API_KEY and X_API_SECRET are set in .env
→ Verify callback URL matches X app settings

## Architecture

```
f&n1.html (SPA Frontend)
         ↓ (OAuth, actions, account sync)
backend/server.js (Express API)
         ↓
data/store.json (JSON file store)
         ↓
encrypted tokens + audit logs
```

## Security Notes

- All tokens are encrypted with AES-256-GCM before storage
- OAuth state tokens expire after 15 minutes
- Every action is logged for audit trails
- Frontend cannot execute actions without backend approval
- Session IDs are user-scoped for isolation

Ready to connect your real X account? Start the backend and open the social tab in the dashboard!
