import express, { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getDb } from '../db/init';
import {
  createAction,
  getProposedActions,
  getActionsForAccount,
  approveAction,
  rejectAction
} from '../models/SocialAction';
import { logAudit } from '../services/audit';

const router = express.Router();

/**
 * GET /api/social/market-signals
 * Get current market signals for user's accounts
 */
router.get('/market-signals', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const accountId = req.query.accountId as string;

    let query = `
      SELECT ms.* FROM market_signals ms
      JOIN social_accounts sa ON ms.account_id = sa.id
      WHERE sa.user_id = ?
    `;
    const params: any[] = [req.userId];

    if (accountId) {
      query += ` AND ms.account_id = ?`;
      params.push(accountId);
    }

    query += ` ORDER BY ms.synced_at DESC LIMIT 1`;

    const signal = await db.get(query, params);

    if (!signal) {
      return res.json({
        audienceDelta: 0,
        engagementRate: 0,
        opportunityScore: 0,
        risk: 'unknown',
        source: 'fallback',
        updatedAt: new Date().toISOString()
      });
    }

    res.json({
      audienceDelta: signal.audience_delta || 0,
      engagementRate: signal.engagement_rate || 0,
      opportunityScore: signal.opportunity_score || 0,
      risk: signal.risk || 'unknown',
      confidence: signal.confidence || 'low',
      source: signal.source || 'fallback',
      updatedAt: signal.synced_at
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch market signals',
      code: 'FETCH_SIGNALS_FAILED'
    });
  }
});

/**
 * POST /api/social/market-signals/update
 * Update market signals for an account
 */
router.post('/market-signals/update', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { accountId, audienceDelta, engagementRate, opportunityScore, risk, source } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing accountId' });
    }

    const db = getDb();
    const { v4: uuidv4 } = await import('uuid');
    const signalId = uuidv4();

    await db.run(
      `INSERT INTO market_signals (id, account_id, audience_delta, engagement_rate, opportunity_score, risk, source, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        signalId,
        accountId,
        audienceDelta || 0,
        engagementRate || 0,
        opportunityScore || 0,
        risk || 'unknown',
        source || 'fallback',
        new Date().toISOString()
      ]
    );

    res.json({ success: true, id: signalId });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update market signals',
      code: 'UPDATE_SIGNALS_FAILED'
    });
  }
});

/**
 * POST /api/social/actions
 * Create a new action (proposal)
 */
router.post('/actions', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { accountId, provider, actionType, title, description, payload } = req.body;

    if (!accountId || !provider || !actionType || !title || !payload) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const action = await createAction(
      req.userId,
      accountId,
      provider,
      actionType,
      title,
      payload,
      { description }
    );

    await logAudit(req.userId, 'ACTION_CREATED', {
      resourceType: 'social_action',
      resourceId: action.id,
      details: { provider, actionType, title }
    });

    res.json(action);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create action',
      code: 'CREATE_ACTION_FAILED'
    });
  }
});

/**
 * GET /api/social/actions
 * Get actions for user (optionally filtered by status)
 */
router.get('/actions', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.query.status as string;

    let actions;
    if (status) {
      actions = await getProposedActions(req.userId);
      actions = actions.filter(a => a.status === status);
    } else {
      actions = await getProposedActions(req.userId);
    }

    res.json({
      items: actions,
      count: actions.length
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch actions',
      code: 'FETCH_ACTIONS_FAILED'
    });
  }
});

/**
 * GET /api/social/actions/:actionId
 * Get details of a specific action
 */
router.get('/actions/:actionId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const action = await db.get(
      `SELECT * FROM social_actions WHERE id = ? AND user_id = ?`,
      [req.params.actionId, req.userId]
    );

    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    res.json(action);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch action',
      code: 'FETCH_ACTION_FAILED'
    });
  }
});

/**
 * POST /api/social/actions/:actionId/approve
 * Approve an action
 */
router.post('/actions/:actionId/approve', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const existing = await db.get(
      `SELECT * FROM social_actions WHERE id = ? AND user_id = ?`,
      [req.params.actionId, req.userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const action = await approveAction(req.params.actionId, req.userId);

    await logAudit(req.userId, 'ACTION_APPROVED', {
      resourceType: 'social_action',
      resourceId: action.id,
      details: { title: action.title }
    });

    res.json(action);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to approve action',
      code: 'APPROVE_ACTION_FAILED'
    });
  }
});

/**
 * POST /api/social/actions/:actionId/reject
 * Reject an action
 */
router.post('/actions/:actionId/reject', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { reason } = req.body;

    const db = getDb();
    const existing = await db.get(
      `SELECT * FROM social_actions WHERE id = ? AND user_id = ?`,
      [req.params.actionId, req.userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const action = await rejectAction(req.params.actionId, reason || 'Rejected by user');

    await logAudit(req.userId, 'ACTION_REJECTED', {
      resourceType: 'social_action',
      resourceId: action.id,
      details: { title: action.title, reason }
    });

    res.json(action);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reject action',
      code: 'REJECT_ACTION_FAILED'
    });
  }
});

export default router;
