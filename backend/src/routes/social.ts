import express, { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createOAuthState, validateOAuthState } from '../models/OAuthState';
import { createOrUpdateAccount, getUserAccounts, deleteAccount } from '../models/SocialAccount';
import { XAuthClient, generateCodeChallenge, generateCodeVerifier } from '../services/XAuthClient';
import { logAudit } from '../services/audit';
import NodeCache from 'node-cache';

const router = express.Router();
const oauthCache = new NodeCache({ stdTTL: 3600 });

/**
 * POST /api/social/oauth/x/start
 * Initiates X OAuth flow
 */
router.post('/oauth/x/start', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const state = await createOAuthState('x', req.userId);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Cache verifier for callback
    oauthCache.set(`oauth_verifier_${state}`, codeVerifier);

    const client = new XAuthClient();
    const authUrl = client.generateAuthUrl(state, codeChallenge);

    await logAudit(req.userId, 'OAUTH_START', {
      resourceType: 'social_account',
      details: { provider: 'x' }
    });

    res.json({
      authUrl,
      state
    });
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start OAuth',
      code: 'OAUTH_START_FAILED'
    });
  }
});

/**
 * POST /api/social/oauth/x/callback
 * Handles X OAuth callback
 */
router.post('/oauth/x/callback', async (req: AuthRequest, res: Response) => {
  try {
    const { code, state } = req.body;

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    // Validate state
    const isValidState = await validateOAuthState(state, 'x');
    if (!isValidState) {
      return res.status(403).json({ error: 'Invalid or expired state token' });
    }

    // Get code verifier from cache
    const codeVerifier = oauthCache.get<string>(`oauth_verifier_${state}`);
    if (!codeVerifier) {
      return res.status(400).json({ error: 'Code verifier not found' });
    }

    // Exchange code for token
    const client = new XAuthClient();
    const tokenData = await client.exchangeCodeForToken(code, codeVerifier);

    // Fetch user info
    const userInfo = await client.getUserInfo(tokenData.access_token);

    // Save account
    const account = await createOrUpdateAccount(
      req.userId,
      'x',
      userInfo.id,
      userInfo.username,
      tokenData.access_token,
      {
        refreshToken: tokenData.refresh_token,
        displayName: userInfo.name,
        profileUrl: `https://twitter.com/${userInfo.username}`,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: tokenData.scope?.split(' '),
        profileData: userInfo
      }
    );

    // Clean cache
    oauthCache.del(`oauth_verifier_${state}`);

    await logAudit(req.userId, 'OAUTH_SUCCESS', {
      resourceType: 'social_account',
      resourceId: account.id,
      details: { provider: 'x', accountId: userInfo.id, handle: userInfo.username }
    });

    res.json({
      success: true,
      account: {
        id: account.id,
        provider: account.provider,
        handle: account.handle,
        displayName: account.display_name,
        connectedAt: account.connected_at
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);

    await logAudit(req.userId || 'unknown', 'OAUTH_FAILED', {
      result: 'failure',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: error instanceof Error ? error.message : 'OAuth callback failed',
      code: 'OAUTH_CALLBACK_FAILED'
    });
  }
});

/**
 * GET /api/social/accounts
 * List connected accounts for user
 */
router.get('/accounts', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accounts = await getUserAccounts(req.userId);

    res.json({
      x: accounts.find(a => a.provider === 'x') || null,
      meta: accounts.find(a => a.provider === 'meta') || null,
      linkedin: accounts.find(a => a.provider === 'linkedin') || null
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch accounts',
      code: 'FETCH_ACCOUNTS_FAILED'
    });
  }
});

/**
 * DELETE /api/social/accounts/:accountId
 * Disconnect an account
 */
router.delete('/accounts/:accountId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { accountId } = req.params;

    await deleteAccount(accountId);

    await logAudit(req.userId, 'ACCOUNT_DISCONNECTED', {
      resourceType: 'social_account',
      resourceId: accountId
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to disconnect account',
      code: 'DISCONNECT_FAILED'
    });
  }
});

export default router;

// ═════════════════════════════════════════════════════════════════════════════
// INSTAGRAM / META ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/social/instagram/accounts
router.get('/instagram/accounts', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    // TODO: Fetch all Instagram accounts for this user from DB
    // Placeholder: return empty list
    res.json({ success: true, accounts: [] });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch accounts' });
  }
});

// GET /api/social/instagram/profile/:accountId
router.get('/instagram/profile/:accountId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountId } = req.params;
    // TODO: Fetch Instagram profile for accountId from DB or Meta API
    res.json({ success: true, profile: {
      username: 'brand_account',
      bio: 'Official brand account',
      profilePicture: '',
      followers: 0,
      postsCount: 0,
      engagementRate: 0,
      verified: false
    }});
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch profile' });
  }
});

// GET /api/social/instagram/feed/:accountId
router.get('/instagram/feed/:accountId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountId } = req.params;
    // TODO: Fetch Instagram feed for accountId from DB or Meta API
    res.json({ success: true, feed: [] });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch feed' });
  }
});

// POST /api/social/instagram/oauth/authorize
router.post('/instagram/oauth/authorize', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    // TODO: Generate Meta OAuth URL and state, return to frontend
    res.json({ success: true, authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth?client_id=APP_ID&redirect_uri=REDIRECT_URI&state=STATE' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start OAuth' });
  }
});

// POST /api/social/instagram/accounts/manual
router.post('/instagram/accounts/manual', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { username, accessToken } = req.body;
    // TODO: Validate token, save account to DB
    res.json({ success: true, account: { id: 'manual-id', username, followers: 0, verified: false } });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to connect account' });
  }
});

// POST /api/social/instagram/accounts/create
router.post('/instagram/accounts/create', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountName } = req.body;
    // TODO: Create new Instagram account via Meta API (if possible)
    res.json({ success: true, accountId: 'new-id', account: { id: 'new-id', username: accountName, followers: 0, verified: false } });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create account' });
  }
});

// POST /api/social/instagram/publish
router.post('/instagram/publish', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountId, caption, mediaUrl, mediaType } = req.body;
    // TODO: Publish post to Instagram via Meta API
    res.json({ success: true, postId: 'mock-post-id' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to publish post' });
  }
});

// GET /api/social/instagram/comments/:postId
router.get('/instagram/comments/:postId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { postId } = req.params;
    // TODO: Fetch comments for postId from Meta API
    res.json({ success: true, comments: [] });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch comments' });
  }
});
