import { getDb } from '../db/init';
import { v4 as uuidv4 } from 'uuid';

export interface OAuthState {
  state: string;
  provider: string;
  user_id?: string;
  created_at: string;
  expires_at: string;
}

export async function createOAuthState(provider: string, userId?: string): Promise<string> {
  const db = getDb();
  const state = uuidv4().replace(/-/g, '');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

  await db.run(
    `INSERT INTO oauth_state (state, provider, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [state, provider, userId || null, now.toISOString(), expiresAt.toISOString()]
  );

  return state;
}

export async function validateOAuthState(state: string, provider: string): Promise<boolean> {
  const db = getDb();
  const row = await db.get(
    `SELECT * FROM oauth_state WHERE state = ? AND provider = ? AND expires_at > datetime('now')`,
    [state, provider]
  );

  if (row) {
    // Clean up after validation
    await db.run(`DELETE FROM oauth_state WHERE state = ?`, [state]);
    return true;
  }

  return false;
}

export async function cleanupExpiredStates(): Promise<void> {
  const db = getDb();
  await db.run(`DELETE FROM oauth_state WHERE expires_at <= datetime('now')`);
}
