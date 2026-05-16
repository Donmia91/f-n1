# Team Workstation Social Backend

Backend service for social account connection, OAuth integration, and task orchestration.

## Architecture

- **Express.js** - HTTP server framework
- **SQLite** - Local data persistence (tokens, audit logs, action queue)
- **Node.js/TypeScript** - Type-safe backend code
- **AES-256-GCM** - Encrypted credential storage

## Features

- ✓ X (Twitter) OAuth 2.0 with PKCE
- ✓ Encrypted token storage (access + refresh tokens)
- ✓ Action approval workflow (proposed → approved → scheduled → published)
- ✓ Audit logging for compliance
- ✓ Market signal caching
- ✓ User session management

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

**Required values:**
- `ENCRYPTION_KEY` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `X_API_KEY` - From X Developer Portal
- `X_API_SECRET` - From X Developer Portal
- `X_CALLBACK_URL` - Must match your X app settings (default: `http://localhost:8787/api/social/oauth/x/callback`)

### 3. Initialize Database

The database is automatically created on first startup. Make sure the `/data` directory is writable.

### 4. Start Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## API Endpoints

### OAuth Flow

- `POST /api/social/oauth/x/start` - Get authorization URL
- `POST /api/social/oauth/x/callback` - Handle OAuth callback (token exchange)

### Accounts

- `GET /api/social/accounts` - List connected social accounts
- `DELETE /api/social/accounts/:accountId` - Disconnect account

### Market Signals

- `GET /api/social/market-signals` - Get account metrics
- `POST /api/social/market-signals/update` - Update metrics cache

### Actions

- `POST /api/social/actions` - Create action proposal
- `GET /api/social/actions` - List proposed actions
- `GET /api/social/actions/:actionId` - Get action details
- `POST /api/social/actions/:actionId/approve` - Approve and execute
- `POST /api/social/actions/:actionId/reject` - Reject proposal

## Security

### Token Storage

- Access tokens and refresh tokens are encrypted with AES-256-GCM before storage
- Encryption key is derived from `ENCRYPTION_KEY` environment variable (must be 32 bytes)
- Each token includes IV and auth tag for secure decryption

### OAuth CSRF Protection

- State tokens are generated with 15-minute expiry
- State is validated on callback before token exchange
- Prevents authorization code interception attacks

### Audit Trail

- Every action is logged with timestamp, user, resource, and result
- Approval workflow is auditable for compliance
- Failed attempts include error details for debugging

### User Sessions

- User IDs are automatically created and persisted in the database
- Frontend can pass `userId` header or query parameter for multi-account support
- Sessions are tied to encrypted accounts for isolation

## Development

### Running Tests

```bash
npm test
```

### Database Inspection

```bash
sqlite3 data/fn1.db
```

### Debugging

Set `NODE_DEBUG=*` for verbose logging:
```bash
NODE_DEBUG=* npm run dev
```

## Integration with Frontend

The frontend ([f&n1.html](../f&n1.html)) connects to this backend via:

1. **Backend URL**: Configured in social connector UI (default: `http://localhost:8787`)
2. **User ID**: Passed via `X-User-ID` header or `userId` query parameter
3. **OAuth Flow**: Frontend opens auth URL in popup, backend handles callback
4. **Polling**: Frontend periodically fetches accounts, signals, and actions

### Environment Variables for Frontend

Set in `.env.example`:
- `FRONTEND_URL` - Where frontend is running (for CORS)
- `X_CALLBACK_URL` - Must be accessible from X auth service

## Troubleshooting

### "ENCRYPTION_KEY must be a 64-character hex string"

Generate a valid key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into your `.env` file.

### "X OAuth credentials not configured"

Set `X_API_KEY` and `X_API_SECRET` in `.env`. Get them from:
1. Visit https://developer.twitter.com/en/portal/dashboard
2. Create a new app or use existing one
3. Go to Keys and tokens → API Keys
4. Copy API Key and API Key Secret

### Database locked error

SQLite can lock if multiple processes access it. Ensure:
- Only one backend instance is running
- No direct SQLite client has the file open
- `/data` directory exists and is writable

### OAuth callback fails

Check that:
1. `X_CALLBACK_URL` in `.env` matches X app settings exactly
2. Backend is accessible from the internet (or use ngrok for local dev)
3. Frontend can reach backend (CORS configured for `FRONTEND_URL`)

## Next Steps

1. **Phase 3**: Implement real market signal ingestion from X API
2. **Phase 4**: Build task template engine with business model guidance
3. **Phase 5**: Add posting workflow to publish approved actions
4. **Phase 7**: Implement rate limiting, retry policies, and observability

## File Structure

```
backend/
├── src/
│   ├── db/           # Database initialization
│   ├── middleware/   # Auth, error handling
│   ├── models/       # Data models (accounts, actions, etc)
│   ├── routes/       # API endpoints
│   ├── services/     # Business logic (OAuth, encryption)
│   └── server.ts     # Express app entry point
├── data/             # SQLite database (created on startup)
├── dist/             # Compiled JavaScript
├── package.json
├── tsconfig.json
└── .env              # Configuration (DO NOT COMMIT)
```
