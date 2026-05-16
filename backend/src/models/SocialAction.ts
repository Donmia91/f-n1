import { getDb } from '../db/init';
import { v4 as uuidv4 } from 'uuid';

export interface SocialAction {
  id: string;
  user_id: string;
  account_id: string;
  provider: string;
  action_type: string;
  title: string;
  description?: string;
  payload: any;
  status: 'proposed' | 'approved' | 'scheduled' | 'published' | 'failed';
  approved_by?: string;
  approved_at?: string;
  scheduled_for?: string;
  published_at?: string;
  failed_at?: string;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

export async function createAction(
  userId: string,
  accountId: string,
  provider: string,
  actionType: string,
  title: string,
  payload: any,
  options: {
    description?: string;
  } = {}
): Promise<SocialAction> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO social_actions 
     (id, user_id, account_id, provider, action_type, title, description, payload, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      accountId,
      provider,
      actionType,
      title,
      options.description || null,
      JSON.stringify(payload),
      'proposed',
      now,
      now
    ]
  );

  const action = await db.get(
    `SELECT * FROM social_actions WHERE id = ?`,
    [id]
  );

  return deserializeAction(action);
}

export async function getAction(actionId: string): Promise<SocialAction | null> {
  const db = getDb();
  const row = await db.get(
    `SELECT * FROM social_actions WHERE id = ?`,
    [actionId]
  );
  return row ? deserializeAction(row) : null;
}

export async function getActionsForAccount(
  accountId: string,
  status?: string
): Promise<SocialAction[]> {
  const db = getDb();
  let query = `SELECT * FROM social_actions WHERE account_id = ?`;
  const params: any[] = [accountId];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = await db.all(query, params);
  return rows.map(deserializeAction);
}

export async function getProposedActions(userId: string): Promise<SocialAction[]> {
  const db = getDb();
  const rows = await db.all(
    `SELECT * FROM social_actions 
     WHERE user_id = ? AND status = 'proposed' 
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map(deserializeAction);
}

export async function approveAction(
  actionId: string,
  approvedBy: string
): Promise<SocialAction> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.run(
    `UPDATE social_actions 
     SET status = ?, approved_by = ?, approved_at = ?, updated_at = ?
     WHERE id = ?`,
    ['approved', approvedBy, now, now, actionId]
  );

  const action = await db.get(
    `SELECT * FROM social_actions WHERE id = ?`,
    [actionId]
  );

  return deserializeAction(action);
}

export async function rejectAction(
  actionId: string,
  reason: string
): Promise<SocialAction> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.run(
    `UPDATE social_actions 
     SET status = ?, failure_reason = ?, updated_at = ?
     WHERE id = ?`,
    ['failed', reason, now, actionId]
  );

  const action = await db.get(
    `SELECT * FROM social_actions WHERE id = ?`,
    [actionId]
  );

  return deserializeAction(action);
}

export async function updateActionStatus(
  actionId: string,
  status: string,
  options: {
    scheduledFor?: Date;
    publishedAt?: Date;
    failedAt?: Date;
    failureReason?: string;
  } = {}
): Promise<SocialAction> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.run(
    `UPDATE social_actions 
     SET status = ?, scheduled_for = ?, published_at = ?, failed_at = ?, failure_reason = ?, updated_at = ?
     WHERE id = ?`,
    [
      status,
      options.scheduledFor?.toISOString() || null,
      options.publishedAt?.toISOString() || null,
      options.failedAt?.toISOString() || null,
      options.failureReason || null,
      now,
      actionId
    ]
  );

  const action = await db.get(
    `SELECT * FROM social_actions WHERE id = ?`,
    [actionId]
  );

  return deserializeAction(action);
}

function deserializeAction(row: any): SocialAction {
  return {
    id: row.id,
    user_id: row.user_id,
    account_id: row.account_id,
    provider: row.provider,
    action_type: row.action_type,
    title: row.title,
    description: row.description,
    payload: JSON.parse(row.payload),
    status: row.status,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    scheduled_for: row.scheduled_for,
    published_at: row.published_at,
    failed_at: row.failed_at,
    failure_reason: row.failure_reason,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
