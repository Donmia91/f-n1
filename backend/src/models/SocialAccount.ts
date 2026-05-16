import { getDb } from '../db/init';
import { v4 as uuidv4 } from 'uuid';
import { encryptToString, decryptFromString } from './encryption';

export interface SocialAccount {
  id: string;
  user_id: string;
  provider: string;
  account_id: string;
  handle: string;
  display_name?: string;
  profile_url?: string;
  token_expires_at?: string;
  scopes?: string;
  profile_data?: any;
  connected_at: string;
  last_sync_at?: string;
  status: string;
}

export async function createOrUpdateAccount(
  userId: string,
  provider: string,
  accountId: string,
  handle: string,
  accessToken: string,
  options: {
    refreshToken?: string;
    displayName?: string;
    profileUrl?: string;
    expiresAt?: Date;
    scopes?: string[];
    profileData?: any;
  } = {}
): Promise<SocialAccount> {
  const db = getDb();
  const accountUuid = uuidv4();
  const encryptedAccessToken = encryptToString(accessToken);
  const encryptedRefreshToken = options.refreshToken ? encryptToString(options.refreshToken) : null;
  const now = new Date().toISOString();

  try {
    // Try update first
    await db.run(
      `UPDATE social_accounts 
       SET encrypted_access_token = ?, encrypted_refresh_token = ?, token_expires_at = ?, 
           display_name = ?, profile_url = ?, profile_data = ?, scopes = ?, updated_at = ?
       WHERE user_id = ? AND provider = ? AND account_id = ?`,
      [
        encryptedAccessToken,
        encryptedRefreshToken,
        options.expiresAt?.toISOString() || null,
        options.displayName || null,
        options.profileUrl || null,
        options.profileData ? JSON.stringify(options.profileData) : null,
        options.scopes ? JSON.stringify(options.scopes) : null,
        now,
        userId,
        provider,
        accountId
      ]
    );

    const result = await db.get(
      `SELECT * FROM social_accounts WHERE user_id = ? AND provider = ? AND account_id = ?`,
      [userId, provider, accountId]
    );

    if (result) {
      return deserializeAccount(result);
    }
  } catch {}

  // Insert if update didn't work
  await db.run(
    `INSERT INTO social_accounts 
     (id, user_id, provider, account_id, handle, encrypted_access_token, encrypted_refresh_token, 
      token_expires_at, display_name, profile_url, profile_data, scopes, connected_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountUuid,
      userId,
      provider,
      accountId,
      handle,
      encryptedAccessToken,
      encryptedRefreshToken,
      options.expiresAt?.toISOString() || null,
      options.displayName || null,
      options.profileUrl || null,
      options.profileData ? JSON.stringify(options.profileData) : null,
      options.scopes ? JSON.stringify(options.scopes) : null,
      now,
      'active'
    ]
  );

  const account = await db.get(
    `SELECT * FROM social_accounts WHERE id = ?`,
    [accountUuid]
  );

  return deserializeAccount(account);
}

export async function getAccount(accountId: string): Promise<(SocialAccount & { accessToken: string; refreshToken?: string }) | null> {
  const db = getDb();
  const row = await db.get(
    `SELECT * FROM social_accounts WHERE id = ?`,
    [accountId]
  );

  if (!row) return null;

  return {
    ...deserializeAccount(row),
    accessToken: decryptFromString(row.encrypted_access_token),
    refreshToken: row.encrypted_refresh_token ? decryptFromString(row.encrypted_refresh_token) : undefined
  };
}

export async function getUserAccounts(userId: string, provider?: string): Promise<SocialAccount[]> {
  const db = getDb();
  let query = `SELECT * FROM social_accounts WHERE user_id = ?`;
  const params: any[] = [userId];

  if (provider) {
    query += ` AND provider = ?`;
    params.push(provider);
  }

  query += ` ORDER BY connected_at DESC`;

  const rows = await db.all(query, params);
  return rows.map(deserializeAccount);
}

export async function deleteAccount(accountId: string): Promise<void> {
  const db = getDb();
  await db.run(
    `UPDATE social_accounts SET status = ?, updated_at = ? WHERE id = ?`,
    ['deleted', new Date().toISOString(), accountId]
  );
}

function deserializeAccount(row: any): SocialAccount {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    account_id: row.account_id,
    handle: row.handle,
    display_name: row.display_name,
    profile_url: row.profile_url,
    token_expires_at: row.token_expires_at,
    scopes: row.scopes ? JSON.parse(row.scopes) : undefined,
    profile_data: row.profile_data ? JSON.parse(row.profile_data) : undefined,
    connected_at: row.connected_at,
    last_sync_at: row.last_sync_at,
    status: row.status
  };
}
