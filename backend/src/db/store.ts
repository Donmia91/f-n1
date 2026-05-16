import fs from 'fs';
import path from 'path';

interface Store {
  users: Record<string, any>;
  accounts: Record<string, any>;
  actions: Record<string, any>;
  signals: Record<string, any>;
  auditLog: any[];
  oauthState: Record<string, any>;
}

let store: Store = {
  users: {},
  accounts: {},
  actions: {},
  signals: {},
  auditLog: [],
  oauthState: {}
};

let storePath: string = './data/store.json';

export function initStore(dataPath: string = './data/store.json'): void {
  storePath = dataPath;
  const dir = path.dirname(storePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8');
      store = JSON.parse(data);
    } else {
      saveStore();
    }
  } catch (err) {
    console.warn('Failed to load store, using defaults:', err);
    saveStore();
  }
}

function saveStore(): void {
  try {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

export function getStore(): Store {
  return store;
}

export function setUser(userId: string, data: any): void {
  store.users[userId] = {
    ...store.users[userId],
    ...data,
    updated_at: new Date().toISOString()
  };
  saveStore();
}

export function getUser(userId: string): any {
  return store.users[userId];
}

export function setAccount(accountId: string, data: any): void {
  store.accounts[accountId] = {
    ...store.accounts[accountId],
    ...data
  };
  saveStore();
}

export function getAccount(accountId: string): any {
  return store.accounts[accountId];
}

export function getAccountsByUserId(userId: string): any[] {
  return Object.values(store.accounts).filter(a => a.user_id === userId);
}

export function deleteAccount(accountId: string): void {
  delete store.accounts[accountId];
  saveStore();
}

export function setAction(actionId: string, data: any): void {
  store.actions[actionId] = {
    ...store.actions[actionId],
    ...data
  };
  saveStore();
}

export function getAction(actionId: string): any {
  return store.actions[actionId];
}

export function getActionsByUserId(userId: string, status?: string): any[] {
  let actions = Object.values(store.actions).filter(a => a.user_id === userId);
  if (status) {
    actions = actions.filter(a => a.status === status);
  }
  return actions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function setSignal(accountId: string, data: any): void {
  store.signals[accountId] = data;
  saveStore();
}

export function getSignal(accountId: string): any {
  return store.signals[accountId];
}

export function addAuditLog(entry: any): void {
  store.auditLog.push({
    ...entry,
    id: entry.id || Math.random().toString(36).substring(7)
  });
  saveStore();
}

export function getAuditLogForUser(userId: string, limit: number = 50): any[] {
  return store.auditLog
    .filter(entry => entry.user_id === userId)
    .slice(-limit)
    .reverse();
}

export function createOAuthState(provider: string, userId?: string): string {
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  store.oauthState[state] = {
    provider,
    userId,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  };

  saveStore();
  return state;
}

export function validateOAuthState(state: string, provider: string): boolean {
  const entry = store.oauthState[state];

  if (!entry || entry.provider !== provider) {
    return false;
  }

  if (new Date(entry.expires_at) < new Date()) {
    delete store.oauthState[state];
    saveStore();
    return false;
  }

  delete store.oauthState[state];
  saveStore();
  return true;
}

export function cleanupExpiredStates(): void {
  const now = new Date();
  let hasChanges = false;

  for (const state in store.oauthState) {
    if (new Date(store.oauthState[state].expires_at) < now) {
      delete store.oauthState[state];
      hasChanges = true;
    }
  }

  if (hasChanges) {
    saveStore();
  }
}
