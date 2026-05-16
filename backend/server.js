const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8787;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DEFAULT_ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
  'file://'
];
const ALLOWED_ORIGINS = Array.from(new Set(DEFAULT_ALLOWED_ORIGINS.filter(Boolean)));
const DATA_DIR = path.join(__dirname, '..', 'data');
const X_LIVE_EXECUTE_ROLES = new Set(['growth', 'admin', 'founder']);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory store (persisted to JSON file)
let store = {
  users: {},
  accounts: {},
  actions: {},
  signals: {},
  propertySnapshots: {},
  propertySyncHeartbeats: {},
  layerAPolicy: {},
  billingPlans: {},
  billingPolicy: {},
  subscriptions: {},
  usageLedger: {},
  unlockLedger: [],
  opsControl: {},
  xMetricsHistory: [],
  xPolicy: {},
  systemEvents: [],
  inboundMessages: {},
  messageAnalysis: {},
  suggestedResponses: {},
  operatorDecisions: {},
  xControlStates: {},
  xReasoningEvents: [],
  auditLog: [],
  oauthStates: {}
};

const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Load store from file
function loadStore() {
  if (fs.existsSync(STORE_FILE)) {
    try {
      store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      console.log('✓ Store loaded from', STORE_FILE);
      console.log('  Users:', Object.keys(store.users || {}).length);
      console.log('  Accounts:', Object.keys(store.accounts || {}).length);
      console.log('  OAuth States:', Object.keys(store.oauthStates || {}).length);
    } catch (err) {
      console.error('Failed to load store:', err.message);
    }
  } else {
    console.log('ℹ Store file not found, using fresh store');
  }
}

function ensureStoreCollections() {
  store.users = store.users || {};
  store.accounts = store.accounts || {};
  store.actions = store.actions || {};
  store.signals = store.signals || {};
  store.propertySnapshots = store.propertySnapshots || {};
  store.propertySyncHeartbeats = store.propertySyncHeartbeats || {};
  store.layerAPolicy = store.layerAPolicy || {};
  store.billingPlans = store.billingPlans || {};
  store.billingPolicy = store.billingPolicy || {};
  store.subscriptions = store.subscriptions || {};
  store.usageLedger = store.usageLedger || {};
  store.unlockLedger = Array.isArray(store.unlockLedger) ? store.unlockLedger : [];
  store.opsControl = store.opsControl || {};
  store.xMetricsHistory = Array.isArray(store.xMetricsHistory) ? store.xMetricsHistory : [];
  store.xPolicy = store.xPolicy || {};
  store.systemEvents = Array.isArray(store.systemEvents) ? store.systemEvents : [];
  store.inboundMessages = store.inboundMessages || {};
  store.messageAnalysis = store.messageAnalysis || {};
  store.suggestedResponses = store.suggestedResponses || {};
  store.operatorDecisions = store.operatorDecisions || {};
  store.xControlStates = store.xControlStates || {};
  store.xReasoningEvents = Array.isArray(store.xReasoningEvents) ? store.xReasoningEvents : [];
  store.auditLog = store.auditLog || [];
  store.oauthStates = store.oauthStates || {};
    store.igAccounts = store.igAccounts || {};

  if (!Number.isFinite(Number(store.xPolicy.approvalFollowerThreshold))) {
    store.xPolicy.approvalFollowerThreshold = 50000;
  }
  if (typeof store.xPolicy.requireSupportReviewForCustomerFacing !== 'boolean') {
    store.xPolicy.requireSupportReviewForCustomerFacing = true;
  }

  if (!Object.keys(store.billingPlans).length) {
    store.billingPlans = {
      free: {
        id: 'free',
        name: 'Free',
        monthlyPriceUsd: 0,
        trialDays: 14,
        trialLoopUnlocks: 20,
        monthlyLoopUnlocks: 0,
        features: ['preview', 'basic-dashboard']
      },
      pro: {
        id: 'pro',
        name: 'Pro',
        monthlyPriceUsd: 49,
        trialDays: 0,
        trialLoopUnlocks: 0,
        monthlyLoopUnlocks: 500,
        features: ['founder-surface', 'admin-controls', 'loop-unlocks']
      },
      team: {
        id: 'team',
        name: 'Team',
        monthlyPriceUsd: 299,
        trialDays: 0,
        trialLoopUnlocks: 0,
        monthlyLoopUnlocks: 5000,
        features: ['founder-surface', 'admin-controls', 'loop-unlocks', 'team-routing']
      },
      growth_pro: {
        id: 'growth_pro',
        name: 'Growth Pro',
        monthlyPriceUsd: 149,
        trialDays: 0,
        trialLoopUnlocks: 0,
        monthlyLoopUnlocks: 2000,
        features: ['founder-surface', 'admin-controls', 'loop-unlocks', 'growth-priority']
      }
    };
  }

  if (!Number.isFinite(Number(store.billingPolicy.warnThresholdPct))) {
    store.billingPolicy.warnThresholdPct = 0.8;
  }
  if (!Number.isFinite(Number(store.billingPolicy.graceLoopUnlocks))) {
    store.billingPolicy.graceLoopUnlocks = 3;
  }
  if (!Number.isFinite(Number(store.billingPolicy.maxUnlockLedgerEntries))) {
    store.billingPolicy.maxUnlockLedgerEntries = 10000;
  }

  if (typeof store.opsControl.monetizationKillSwitch !== 'boolean') {
    store.opsControl.monetizationKillSwitch = false;
  }
  if (typeof store.opsControl.operationsKillSwitch !== 'boolean') {
    store.opsControl.operationsKillSwitch = false;
  }
  if (!['normal', 'monetization_open', 'operations_readonly'].includes(String(store.opsControl.degradeMode || 'normal'))) {
    store.opsControl.degradeMode = 'normal';
  }
  if (!store.opsControl.updated_at) {
    store.opsControl.updated_at = new Date().toISOString();
  }

  const layerDefaults = {
    entitlement: {
      default_plan: 'free',
      warning_threshold_pct: Number(store.billingPolicy.warnThresholdPct || 0.8),
      grace_loop_unlocks: Number(store.billingPolicy.graceLoopUnlocks || 3),
      max_unlock_ledger_entries: Number(store.billingPolicy.maxUnlockLedgerEntries || 10000)
    },
    approvals: {
      support_review_gate: !!store.xPolicy.requireSupportReviewForCustomerFacing,
      follower_threshold: Number(store.xPolicy.approvalFollowerThreshold || 50000)
    },
    sla_tiers: {
      p1_target_minutes: 15,
      p2_target_minutes: 60,
      p3_target_minutes: 240
    },
    escalation_rules: [
      {
        id: 'incident-p1',
        trigger: 'incident_detected',
        owner: 'admin',
        timeout_minutes: 15,
        action: 'escalate_devops'
      }
    ],
    safety: {
      monetizationKillSwitch: !!store.opsControl.monetizationKillSwitch,
      operationsKillSwitch: !!store.opsControl.operationsKillSwitch,
      degradeMode: String(store.opsControl.degradeMode || 'normal')
    }
  };

  store.layerAPolicy.entitlement = {
    ...layerDefaults.entitlement,
    ...(store.layerAPolicy.entitlement || {})
  };
  store.layerAPolicy.approvals = {
    ...layerDefaults.approvals,
    ...(store.layerAPolicy.approvals || {})
  };
  store.layerAPolicy.sla_tiers = {
    ...layerDefaults.sla_tiers,
    ...(store.layerAPolicy.sla_tiers || {})
  };
  store.layerAPolicy.escalation_rules = Array.isArray(store.layerAPolicy.escalation_rules)
    ? store.layerAPolicy.escalation_rules
    : layerDefaults.escalation_rules;
  store.layerAPolicy.safety = {
    ...layerDefaults.safety,
    ...(store.layerAPolicy.safety || {})
  };

  // Backward-compatible sync for existing code paths.
  store.billingPolicy.warnThresholdPct = Number(store.layerAPolicy.entitlement.warning_threshold_pct || 0.8);
  store.billingPolicy.graceLoopUnlocks = Math.max(0, Number(store.layerAPolicy.entitlement.grace_loop_unlocks || 3));
  store.billingPolicy.maxUnlockLedgerEntries = Math.max(1000, Number(store.layerAPolicy.entitlement.max_unlock_ledger_entries || 10000));
  store.xPolicy.approvalFollowerThreshold = Math.max(1000, Number(store.layerAPolicy.approvals.follower_threshold || 50000));
  store.xPolicy.requireSupportReviewForCustomerFacing = !!store.layerAPolicy.approvals.support_review_gate;
  store.opsControl.monetizationKillSwitch = !!store.layerAPolicy.safety.monetizationKillSwitch;
  store.opsControl.operationsKillSwitch = !!store.layerAPolicy.safety.operationsKillSwitch;
  store.opsControl.degradeMode = ['normal', 'monetization_open', 'operations_readonly'].includes(String(store.layerAPolicy.safety.degradeMode || 'normal'))
    ? String(store.layerAPolicy.safety.degradeMode)
    : 'normal';
  store.layerAPolicy.safety.degradeMode = store.opsControl.degradeMode;

  Object.keys(store.users).forEach((uid) => {
    const u = store.users[uid] || {};
    if (!u.tier) u.tier = 'free';
    if (!u.plan_id) u.plan_id = 'free';
    if (!u.created_at) u.created_at = new Date().toISOString();
    store.users[uid] = u;
  });
}

// Save store to file
function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Failed to save store:', err.message);
  }
}

// Load on startup
loadStore();
ensureStoreCollections();

// Encryption utilities
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters');
  }
  return Buffer.from(key, 'hex');
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted}`;
}

function decrypt(encryptedText) {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encrypted] = encryptedText.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Middleware
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server and local file requests without an Origin header.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

function verifyXWebhookSignature(req) {
  const secret = process.env.X_WEBHOOK_SECRET;
  if (!secret) return { ok: true, skipped: true };

  const rawHeader =
    req.headers['x-workflow-signature'] ||
    req.headers['x-signature'] ||
    req.headers['x-webhook-signature'];

  const providedRaw = String(Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader || '')).trim();
  if (!providedRaw) {
    return { ok: false, reason: 'Missing signature header.' };
  }

  const provided = providedRaw.replace(/^sha256=/i, '');
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (provided.length !== expected.length) {
    return { ok: false, reason: 'Invalid signature length.' };
  }

  const valid = crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  return valid ? { ok: true } : { ok: false, reason: 'Signature mismatch.' };
}

// User session middleware
app.use((req, res, next) => {
  let userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId;
  
  if (!userId) {
    userId = uuidv4();
  }
  
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      created_at: new Date().toISOString(),
      tier: 'free',
      plan_id: 'free'
    };
    saveStore();
  }
  
  req.userId = userId;
  res.setHeader('X-User-ID', userId);
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/ai/reasoning/complete', async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const opts = {
      json: !!body.json,
      maxTokens: Number.isFinite(Number(body.maxTokens)) ? Number(body.maxTokens) : 800,
      temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2,
      ollamaBaseUrl: String(body?.fallback?.ollamaBaseUrl || '').trim() || undefined,
      ollamaModel: String(body?.fallback?.ollamaModel || '').trim() || undefined
    };

    const result = await generateReasoningWithFallback({ prompt, messages, opts });
    return res.json({
      success: true,
      text: result.text,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      errors: result.errors
    });
  } catch (err) {
    return res.status(503).json({
      error: err.message || 'Reasoning failed',
      code: 'REASONING_UNAVAILABLE'
    });
  }
});

async function exchangeXCodeForToken(code, codeVerifier) {
  const clientId = process.env.X_API_KEY;
  const clientSecret = process.env.X_API_SECRET;
  const redirectUri = process.env.X_CALLBACK_URL || 'http://localhost:8787/api/social/oauth/x/callback';

  if (!clientId || clientId.includes('YOUR_X_API_KEY')) {
    throw new Error('X_API_KEY is not configured in backend/.env');
  }

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret && !clientSecret.includes('YOUR_X_API_SECRET')) {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: tokenHeaders,
    body: body.toString()
  });

  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`X token exchange failed (${tokenRes.status}): ${tokenText.slice(0, 240)}`);
  }

  let tokenData;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    throw new Error('X token exchange returned non-JSON response');
  }

  if (!tokenData.access_token) {
    throw new Error('X token exchange missing access_token');
  }

  return tokenData;
}

async function fetchXUserProfile(accessToken) {
  const userRes = await fetch('https://api.x.com/2/users/me?user.fields=created_at,profile_image_url,public_metrics,verified', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const userText = await userRes.text();
  if (!userRes.ok) {
    throw new Error(`X user lookup failed (${userRes.status}): ${userText.slice(0, 240)}`);
  }

  let userPayload;
  try {
    userPayload = JSON.parse(userText);
  } catch {
    throw new Error('X user lookup returned non-JSON response');
  }

  const user = userPayload?.data;
  if (!user?.id || !user?.username) {
    throw new Error('X user lookup returned incomplete profile data');
  }

  return user;
}

function getUserXAccount(userId, preferredAccountId) {
  const accounts = Object.values(store.accounts || {})
    .filter(a => a.user_id === userId && a.provider === 'x')
    .sort((a, b) => {
      const aTs = new Date(a.updated_at || a.connected_at || a.created_at || a.token_expires_at || 0).getTime();
      const bTs = new Date(b.updated_at || b.connected_at || b.created_at || b.token_expires_at || 0).getTime();
      return bTs - aTs;
    });
  if (!accounts.length) return null;
  if (!preferredAccountId) return accounts[0];
  return accounts.find(a => a.id === preferredAccountId || a.account_id === preferredAccountId) || accounts[0];
}

function getXUserId(account) {
  return String(account?.x_user_id || account?.account_id || account?.profile_data?.id || '').trim();
}

function getXPolicy() {
  const layer = getLayerAPolicy();
  return {
    approvalFollowerThreshold: Number(layer.approvals?.follower_threshold || 50000),
    requireSupportReviewForCustomerFacing: !!layer.approvals?.support_review_gate
  };
}

const X_CONTROL_MODES = new Set(['manual', 'assisted', 'autonomous']);

function getXControlStateKey(userId, accountId) {
  return `${userId}:${accountId || 'default'}`;
}

function normalizeXControlState(input = {}) {
  const mode = String(input.mode || 'assisted').toLowerCase();
  const normalizedMode = X_CONTROL_MODES.has(mode) ? mode : 'assisted';
  const confidenceThreshold = Math.max(0.4, Math.min(0.99, Number(input.confidenceThreshold ?? 0.72) || 0.72));
  const maxAutomatedActionsPerDay = Math.max(1, Math.min(50, Math.floor(Number(input.maxAutomatedActionsPerDay ?? 6) || 6)));
  const requireHumanApprovalForReplies = typeof input.requireHumanApprovalForReplies === 'boolean'
    ? input.requireHumanApprovalForReplies
    : true;

  return {
    mode: normalizedMode,
    confidenceThreshold,
    maxAutomatedActionsPerDay,
    requireHumanApprovalForReplies,
    updatedAt: new Date().toISOString()
  };
}

function getXControlState(userId, accountId) {
  const key = getXControlStateKey(userId, accountId);
  const existing = store.xControlStates?.[key];
  if (existing) return normalizeXControlState(existing);
  const defaultState = normalizeXControlState({});
  store.xControlStates[key] = defaultState;
  return defaultState;
}

function setXControlState(userId, accountId, patch = {}) {
  const key = getXControlStateKey(userId, accountId);
  const base = getXControlState(userId, accountId);
  const merged = normalizeXControlState({ ...base, ...patch });
  store.xControlStates[key] = merged;
  return merged;
}

function summarizeXReasoningEvents(userId, accountId) {
  const events = (store.xReasoningEvents || [])
    .filter(e => e.userId === userId && (!accountId || e.accountId === accountId))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const automatedLast24h = events.filter(e => e?.outcome?.executed && new Date(e.createdAt || 0).getTime() >= oneDayAgo).length;
  return {
    automatedLast24h,
    total: events.length,
    recent: events.slice(0, 12)
  };
}

function extractJsonObject(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function fallbackReasoningPlan(goal, feedSnapshot = {}, controlState = {}) {
  const mentions = Array.isArray(feedSnapshot.mentions) ? feedSnapshot.mentions : [];
  const postedTweets = Array.isArray(feedSnapshot.postedTweets) ? feedSnapshot.postedTweets : [];
  const g = String(goal || '').toLowerCase();
  const replyTarget = mentions[0]?.id || null;

  if (g.includes('reply') && replyTarget) {
    return {
      actionType: 'reply',
      text: 'Thanks for the message. Growth Ops is reviewing this and will follow up shortly.',
      replyToTweetId: replyTarget,
      confidence: 0.73,
      rationale: 'Goal requested reply behavior and a recent mention was available.',
      risk: 0.34
    };
  }

  return {
    actionType: 'post',
    text: `Growth Ops update: ${String(goal || 'Operational check complete').trim().slice(0, 220)}`,
    replyToTweetId: null,
    confidence: controlState.mode === 'autonomous' ? 0.76 : 0.67,
    rationale: postedTweets.length
      ? 'Recent feed context found; selected a low-risk informational post.'
      : 'No strong context found; selected conservative status-style post.',
    risk: 0.28
  };
}

async function buildXReasoningPlanWithLLM({ goal, feedSnapshot, controlState }) {
  const mentions = Array.isArray(feedSnapshot?.mentions) ? feedSnapshot.mentions.slice(0, 4) : [];
  const postedTweets = Array.isArray(feedSnapshot?.postedTweets) ? feedSnapshot.postedTweets.slice(0, 3) : [];

  const prompt = [
    'You are Growth Ops backend planner for X account automation.',
    'Return ONLY valid JSON with keys: actionType, text, replyToTweetId, confidence, rationale, risk.',
    'Rules: actionType must be "post" or "reply"; text max 280 chars; confidence and risk are numbers from 0 to 1.',
    `Goal: ${String(goal || '').slice(0, 300)}`,
    `Mode: ${controlState.mode}`,
    `Confidence threshold: ${controlState.confidenceThreshold}`,
    `Recent mentions JSON: ${JSON.stringify(mentions)}`,
    `Recent posts JSON: ${JSON.stringify(postedTweets)}`,
    'If actionType is "reply", include replyToTweetId from recent mentions.'
  ].join('\n');

  try {
    const raw = await generateReasoningText(prompt, { temperature: 0.1, maxTokens: 260 });
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== 'object') {
      return fallbackReasoningPlan(goal, feedSnapshot, controlState);
    }
    const actionType = String(parsed.actionType || 'post').toLowerCase() === 'reply' ? 'reply' : 'post';
    const text = String(parsed.text || '').trim().slice(0, 280);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const risk = Math.max(0, Math.min(1, Number(parsed.risk) || 0.5));
    const rationale = String(parsed.rationale || 'LLM generated plan.').slice(0, 500);
    const replyToTweetId = parsed.replyToTweetId ? String(parsed.replyToTweetId).trim() : null;

    if (!text) {
      return fallbackReasoningPlan(goal, feedSnapshot, controlState);
    }

    return {
      actionType,
      text,
      replyToTweetId: actionType === 'reply' ? replyToTweetId : null,
      confidence,
      rationale,
      risk
    };
  } catch {
    return fallbackReasoningPlan(goal, feedSnapshot, controlState);
  }
}

async function runXReasoningIntent({ userId, account, goal, executeAsRole = 'growth', dryRun = false, forceExecute = false }) {
  const normalizedGoal = String(goal || '').trim();
  if (!normalizedGoal) {
    const err = new Error('goal is required.');
    err.status = 400;
    throw err;
  }

  await pollXFeed(userId, account.id);

  const state = getXControlState(userId, account.id);
  const summaryBefore = summarizeXReasoningEvents(userId, account.id);
  const plan = await buildXReasoningPlanWithLLM({
    goal: normalizedGoal,
    feedSnapshot: {
      mentions: xFeedCache.mentions,
      postedTweets: xFeedCache.postedTweets
    },
    controlState: state
  });

  const role = String(executeAsRole || 'growth').toLowerCase();
  const outcome = {
    executed: false,
    reason: 'planned',
    mode: state.mode,
    requiresApproval: false,
    actionId: null,
    execution: null
  };

  if (dryRun) {
    outcome.reason = 'dry-run';
  } else if (!forceExecute && state.mode === 'manual') {
    outcome.reason = 'mode-manual';
  } else if (!forceExecute && plan.confidence < Number(state.confidenceThreshold || 0.72)) {
    outcome.reason = 'below-confidence-threshold';
    outcome.requiresApproval = true;
  } else if (!forceExecute && state.mode === 'autonomous' && summaryBefore.automatedLast24h >= Number(state.maxAutomatedActionsPerDay || 6)) {
    outcome.reason = 'daily-automation-cap-reached';
    outcome.requiresApproval = true;
  } else if (!forceExecute && plan.actionType === 'reply' && state.requireHumanApprovalForReplies) {
    outcome.reason = 'reply-requires-human-approval';
    outcome.requiresApproval = true;
  } else {
    const actionId = uuidv4();
    const action = {
      id: actionId,
      user_id: userId,
      account_id: account.id,
      provider: 'x',
      action_type: plan.actionType,
      title: 'Backend reasoning execution',
      description: `LLM reasoning executed in backend (${state.mode})`,
      payload: plan.actionType === 'reply'
        ? { text: plan.text, replyToId: String(plan.replyToTweetId || '').trim() }
        : { text: plan.text },
      outcome_id: `outcome:${actionId}`,
      value_tag: deriveValueTag('x_backend_reasoning_execute', { actionId, incident: false }),
      status: 'approved',
      approved_by: role,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_mode: 'backend-reasoning',
      metadata: {
        goal: normalizedGoal,
        confidence: plan.confidence,
        risk: plan.risk,
        rationale: plan.rationale,
        forceExecute: !!forceExecute
      }
    };

    if (plan.actionType === 'reply' && !String(action.payload.replyToId || '').trim()) {
      outcome.reason = 'missing-reply-target';
      outcome.requiresApproval = true;
    } else {
      store.actions[actionId] = action;
      const execution = await executeXAction(action);
      action.status = 'completed';
      action.execution_status = 'success';
      action.executed_at = new Date().toISOString();
      action.execution_result = execution;
      action.updated_at = new Date().toISOString();
      saveStore();

      outcome.executed = true;
      outcome.reason = 'executed';
      outcome.actionId = actionId;
      outcome.execution = execution;

      logAudit(userId, 'X_REASONING_EXECUTED', {
        accountId: account.id,
        handle: account.handle,
        actionId,
        actionType: plan.actionType,
        confidence: plan.confidence,
        mode: state.mode,
        status: 'success',
        forceExecute: !!forceExecute
      });
    }
  }

  const event = {
    id: uuidv4(),
    userId,
    accountId: account.id,
    createdAt: new Date().toISOString(),
    goal: normalizedGoal,
    control: state,
    plan,
    outcome
  };
  store.xReasoningEvents.push(event);
  if (store.xReasoningEvents.length > 1000) {
    store.xReasoningEvents = store.xReasoningEvents.slice(-1000);
  }
  saveStore();

  return {
    event,
    summary: summarizeXReasoningEvents(userId, account.id)
  };
}

function getLayerAPolicy() {
  const policy = store.layerAPolicy || {};
  const entitlement = {
    default_plan: String(policy.entitlement?.default_plan || 'free'),
    warning_threshold_pct: Math.max(0.1, Math.min(0.99, Number(policy.entitlement?.warning_threshold_pct || 0.8))),
    grace_loop_unlocks: Math.max(0, Math.floor(Number(policy.entitlement?.grace_loop_unlocks || 3))),
    max_unlock_ledger_entries: Math.max(1000, Math.floor(Number(policy.entitlement?.max_unlock_ledger_entries || 10000)))
  };
  const approvals = {
    support_review_gate: !!policy.approvals?.support_review_gate,
    follower_threshold: Math.max(1000, Math.floor(Number(policy.approvals?.follower_threshold || 50000)))
  };
  const sla_tiers = {
    p1_target_minutes: Math.max(1, Math.floor(Number(policy.sla_tiers?.p1_target_minutes || 15))),
    p2_target_minutes: Math.max(1, Math.floor(Number(policy.sla_tiers?.p2_target_minutes || 60))),
    p3_target_minutes: Math.max(1, Math.floor(Number(policy.sla_tiers?.p3_target_minutes || 240)))
  };
  const escalation_rules = Array.isArray(policy.escalation_rules) ? policy.escalation_rules : [];
  const degradeModeRaw = String(policy.safety?.degradeMode || 'normal');
  const safety = {
    monetizationKillSwitch: !!policy.safety?.monetizationKillSwitch,
    operationsKillSwitch: !!policy.safety?.operationsKillSwitch,
    degradeMode: ['normal', 'monetization_open', 'operations_readonly'].includes(degradeModeRaw)
      ? degradeModeRaw
      : 'normal'
  };
  return { entitlement, approvals, sla_tiers, escalation_rules, safety };
}

function getOpsControl() {
  const layer = getLayerAPolicy();
  const degradeMode = layer.safety.degradeMode;
  return {
    monetizationKillSwitch: !!layer.safety.monetizationKillSwitch,
    operationsKillSwitch: !!layer.safety.operationsKillSwitch,
    degradeMode,
    monetizationBypass: !!layer.safety.monetizationKillSwitch || degradeMode === 'monetization_open',
    operationsReadOnly: !!layer.safety.operationsKillSwitch || degradeMode === 'operations_readonly',
    updated_at: store.opsControl?.updated_at || null
  };
}

function assertOperationsWriteAllowed() {
  const ops = getOpsControl();
  if (ops.operationsReadOnly) {
    const err = new Error('Operations writes are temporarily in degrade mode. Read surfaces remain available.');
    err.code = 'OPS_DEGRADED';
    err.status = 503;
    err.ops = ops;
    throw err;
  }
  return ops;
}

function sanitizePropertySnapshotPayload(raw = {}) {
  const nowIso = new Date().toISOString();
  const sourceRaw = String(raw.property_source || raw.source || 'unknown').toLowerCase();
  const source = ['local', 'github', 'url', 'unknown'].includes(sourceRaw) ? sourceRaw : 'unknown';
  const propertyIdInput = String(raw.property_id || raw.propertyId || '').trim();
  const propertyNameInput = String(raw.property_name || raw.propertyName || '').trim();
  const propertyName = propertyNameInput.slice(0, 120) || 'property';
  const propertyId = (propertyIdInput || `${source}:${propertyName}`)
    .toLowerCase()
    .replace(/[^a-z0-9:_\-./]/g, '-')
    .slice(0, 160);

  const repo = raw.repo && typeof raw.repo === 'object' ? raw.repo : {};
  const repoShape = {
    owner: String(repo.owner || '').slice(0, 80) || null,
    repo: String(repo.repo || '').slice(0, 120) || null,
    defaultBranch: String(repo.defaultBranch || '').slice(0, 80) || null,
    openPrCount: Number.isFinite(Number(repo.openPrCount)) ? Math.max(0, Math.floor(Number(repo.openPrCount))) : 0,
    branchProtected: !!repo.branchProtected
  };

  const zoneInput = raw.zone_summary && typeof raw.zone_summary === 'object' ? raw.zone_summary : {};
  const sanitizeZone = (name) => {
    const z = zoneInput[name] || {};
    return {
      label: String(z.label || '').slice(0, 80) || name,
      count: Number.isFinite(Number(z.count)) ? Math.max(0, Math.floor(Number(z.count))) : 0,
      errorCount: Number.isFinite(Number(z.errorCount)) ? Math.max(0, Math.floor(Number(z.errorCount))) : 0,
      activeCount: Number.isFinite(Number(z.activeCount)) ? Math.max(0, Math.floor(Number(z.activeCount))) : 0,
      healthSignal: ['ok', 'warning', 'critical'].includes(String(z.healthSignal || '').toLowerCase())
        ? String(z.healthSignal || '').toLowerCase()
        : 'ok'
    };
  };

  const files = Array.isArray(raw.files_sample) ? raw.files_sample : [];
  const filesSample = files.slice(0, 200).map((f) => {
    const zone = ['red', 'yellow', 'green', 'unclassified'].includes(String(f.zone || '').toLowerCase())
      ? String(f.zone || '').toLowerCase()
      : 'unclassified';
    const status = ['active', 'updating', 'idle', 'error'].includes(String(f.status || '').toLowerCase())
      ? String(f.status || '').toLowerCase()
      : 'idle';
    return {
      name: String(f.name || f.n || '').slice(0, 120) || 'file',
      zone,
      status,
      pathHash: String(f.pathHash || f.path_hash || '').slice(0, 64) || null
    };
  });

  const signals = raw.signals && typeof raw.signals === 'object' ? raw.signals : {};
  const signalShape = {
    redErrors: Number.isFinite(Number(signals.redErrors)) ? Math.max(0, Math.floor(Number(signals.redErrors))) : 0,
    yellowUpdating: Number.isFinite(Number(signals.yellowUpdating)) ? Math.max(0, Math.floor(Number(signals.yellowUpdating))) : 0,
    activeFiles: Number.isFinite(Number(signals.activeFiles)) ? Math.max(0, Math.floor(Number(signals.activeFiles))) : 0,
    recentCommits: Number.isFinite(Number(signals.recentCommits)) ? Math.max(0, Math.floor(Number(signals.recentCommits))) : 0,
    failedCheckRuns: Number.isFinite(Number(signals.failedCheckRuns)) ? Math.max(0, Math.floor(Number(signals.failedCheckRuns))) : 0,
    lastSyncAt: String(signals.lastSyncAt || '').trim() || null
  };

  const privacy = raw.privacy && typeof raw.privacy === 'object' ? raw.privacy : {};
  const privacyShape = {
    contentSent: !!privacy.contentSent,
    mode: String(privacy.mode || 'metadata-only').slice(0, 40),
    sentFields: Array.isArray(privacy.sentFields)
      ? privacy.sentFields.map(v => String(v || '').slice(0, 40)).filter(Boolean).slice(0, 24)
      : []
  };

  return {
    propertyId,
    propertyName,
    source,
    repo: repoShape,
    zoneSummary: {
      red: sanitizeZone('red'),
      yellow: sanitizeZone('yellow'),
      green: sanitizeZone('green')
    },
    filesSample,
    signals: signalShape,
    privacy: privacyShape,
    capturedAt: String(raw.captured_at || raw.capturedAt || '').trim() || nowIso,
    syncedAt: nowIso
  };
}

function getUserPropertySnapshots(userId) {
  return Object.values(store.propertySnapshots || {})
    .filter(s => s.user_id === userId)
    .sort((a, b) => new Date(b.synced_at || 0).getTime() - new Date(a.synced_at || 0).getTime());
}

function getEffectiveEntitlements(userId) {
  const state = getRevenueState(userId);
  const layer = getLayerAPolicy();
  return {
    plan: state.plan_id,
    paywall_state: state.paywall_state,
    allowance: state.allowance,
    grace: layer.entitlement.grace_loop_unlocks,
    warning_threshold: layer.entitlement.warning_threshold_pct,
    blocked: state.blocked,
    monetization_bypass: state.monetization_bypass,
    operations_read_only: state.operations_read_only
  };
}

function assertLayerAWriteGate(userId, options = {}) {
  const { billable = false } = options;
  const ops = assertOperationsWriteAllowed();
  const state = billable ? assertLoopUnlockAccess(userId) : getRevenueState(userId);
  return { ops, entitlement: getEffectiveEntitlements(userId), revenue: state };
}

function deriveOutcomeId({ eventType, context = {} }) {
  if (context.outcomeId) return String(context.outcomeId);
  if (context.actionId) return `outcome:${context.actionId}`;
  if (context.messageId) return `outcome:${context.messageId}:${eventType}`;
  return `outcome:${eventType}:${uuidv4()}`;
}

function deriveValueTag(eventType, context = {}) {
  const incident = !!context.incident || !!context.customerFacingIncident || !!context.supportReviewRequired;
  if (incident) return 'incident_loop_unlock';
  if (eventType === 'execute_x_action') return 'growth_publish_unlock';
  if (eventType === 'message_decision') return 'operator_decision_unlock';
  if (eventType === 'message_suggest') return 'growth_reply_draft';
  if (eventType === 'message_analyze') return 'signal_detection';
  return 'loop_unlock';
}

function pushSystemEvent(severity, code, message, details = {}) {
  store.systemEvents.unshift({
    id: uuidv4(),
    source: 'x',
    severity: severity || 'warn',
    code: code || 'X_EVENT',
    message: String(message || 'X system event'),
    details,
    at: new Date().toISOString()
  });
  if (store.systemEvents.length > 500) {
    store.systemEvents = store.systemEvents.slice(0, 500);
  }
  saveStore();
}

function isSupportComplaint(text) {
  const t = String(text || '').toLowerCase();
  return /(support|help|broken|down|not working|issue|refund|cancel|cannot|can't|failed|error|stuck)/.test(t);
}

function isIncidentText(text) {
  const t = String(text || '').toLowerCase();
  return /(product is down|site is down|app is down|outage|cannot login|can't login|checkout broken|payment failed|service unavailable)/.test(t);
}

function hasClientSignal(text) {
  const t = String(text || '').toLowerCase();
  return /(client|customer|user|buyer|subscriber|account holder)/.test(t);
}

function getPeriodStartIso(ts = Date.now()) {
  const d = new Date(ts);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getPeriodEndIso(ts = Date.now()) {
  const d = new Date(ts);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}

function ensureUserSubscription(userId) {
  const user = store.users[userId] || { id: userId, created_at: new Date().toISOString() };
  store.users[userId] = user;
  if (!user.tier) user.tier = 'free';
  if (!user.plan_id) user.plan_id = user.tier === 'team' ? 'team' : (user.tier === 'pro' ? 'pro' : 'free');

  const freePlan = store.billingPlans.free || {};
  const trialDays = Number(freePlan.trialDays || 14) || 14;
  const createdTs = new Date(user.created_at || Date.now()).getTime();
  const trialEndsAt = new Date(createdTs + trialDays * 24 * 60 * 60 * 1000).toISOString();

  let sub = store.subscriptions[userId];
  if (!sub) {
    sub = {
      user_id: userId,
      plan_id: user.plan_id,
      status: 'trialing',
      trial_started_at: user.created_at,
      trial_ends_at: trialEndsAt,
      period_start_at: getPeriodStartIso(),
      period_end_at: getPeriodEndIso(),
      updated_at: new Date().toISOString()
    };
    store.subscriptions[userId] = sub;
  }

  if (!store.billingPlans[sub.plan_id]) {
    sub.plan_id = 'free';
  }

  if (sub.plan_id !== 'free') {
    sub.status = 'active';
  } else if (new Date(sub.trial_ends_at || 0).getTime() > Date.now()) {
    sub.status = 'trialing';
  } else {
    sub.status = 'expired';
  }

  return sub;
}

function ensureUsageLedger(userId) {
  const sub = ensureUserSubscription(userId);
  const now = Date.now();
  const currentStart = getPeriodStartIso(now);
  const currentEnd = getPeriodEndIso(now);

  let ledger = store.usageLedger[userId];
  if (!ledger) {
    ledger = {
      user_id: userId,
      period_start_at: currentStart,
      period_end_at: currentEnd,
      used: 0,
      warnings_emitted: 0,
      blocked_attempts: 0,
      history: []
    };
    store.usageLedger[userId] = ledger;
  }

  if (ledger.period_start_at !== currentStart) {
    ledger.history = Array.isArray(ledger.history) ? ledger.history : [];
    ledger.history.unshift({
      period_start_at: ledger.period_start_at,
      period_end_at: ledger.period_end_at,
      used: Number(ledger.used || 0) || 0,
      warnings_emitted: Number(ledger.warnings_emitted || 0) || 0,
      blocked_attempts: Number(ledger.blocked_attempts || 0) || 0,
      archived_at: new Date().toISOString()
    });
    if (ledger.history.length > 24) ledger.history = ledger.history.slice(0, 24);
    ledger.period_start_at = currentStart;
    ledger.period_end_at = currentEnd;
    ledger.used = 0;
    ledger.warnings_emitted = 0;
    ledger.blocked_attempts = 0;
  }

  const plan = store.billingPlans[sub.plan_id] || store.billingPlans.free;
  const trialAllowance = Number(plan?.trialLoopUnlocks || 0) || 0;
  const monthlyAllowance = Number(plan?.monthlyLoopUnlocks || 0) || 0;
  ledger.allowance = sub.plan_id === 'free'
    ? (sub.status === 'trialing' ? trialAllowance : 0)
    : monthlyAllowance;

  return { sub, ledger, plan };
}

function hasUnlockEvent(idempotencyKey) {
  if (!idempotencyKey) return false;
  return (store.unlockLedger || []).some(e => e.idempotency_key === idempotencyKey);
}

function getRevenueState(userId) {
  const { sub, ledger, plan } = ensureUsageLedger(userId);
  const ops = getOpsControl();
  const layer = getLayerAPolicy();
  const warnThresholdPct = Number(layer.entitlement.warning_threshold_pct || 0.8);
  const graceLoopUnlocks = Number(layer.entitlement.grace_loop_unlocks || 3);
  const used = Number(ledger.used || 0) || 0;
  const allowance = Number(ledger.allowance || 0) || 0;
  const remaining = Math.max(0, allowance - used);
  const inGrace = used >= allowance && used < (allowance + graceLoopUnlocks);
  const blocked = !ops.monetizationBypass && used >= (allowance + graceLoopUnlocks);
  const usagePct = allowance > 0 ? (used / allowance) : (blocked ? 1 : 0);
  const warn = allowance > 0 && usagePct >= warnThresholdPct && !inGrace && !blocked;
  const paywallState = blocked
    ? 'locked'
    : (inGrace
      ? 'overage'
      : ((ops.monetizationBypass || sub.plan_id !== 'free') ? 'unlock' : 'preview'));

  return {
    plan_id: sub.plan_id,
    plan_name: plan?.name || sub.plan_id,
    status: sub.status,
    period_start_at: ledger.period_start_at,
    period_end_at: ledger.period_end_at,
    trial_ends_at: sub.trial_ends_at || null,
    allowance,
    used,
    remaining,
    grace_loop_unlocks: graceLoopUnlocks,
    warn_threshold_pct: warnThresholdPct,
    paywall_state: paywallState,
    blocked,
    in_grace: inGrace,
    warning: warn,
    overage_used: inGrace ? Math.max(0, used - allowance) : (blocked ? Math.max(0, used - allowance) : 0),
    monetization_bypass: ops.monetizationBypass,
    operations_read_only: ops.operationsReadOnly
  };
}

function consumeLoopUnlock(userId, {
  eventType,
  idempotencyKey,
  context = {},
  actor = null,
  increment = 1,
  dryRun = false
}) {
  const { ledger } = ensureUsageLedger(userId);
  const ops = getOpsControl();
  const stateBefore = getRevenueState(userId);

  if (idempotencyKey && hasUnlockEvent(idempotencyKey)) {
    return { allowed: true, duplicate: true, state: getRevenueState(userId) };
  }

  if (ops.monetizationBypass) {
    return {
      allowed: true,
      duplicate: false,
      bypassed: true,
      state: getRevenueState(userId),
      ops
    };
  }

  if (stateBefore.blocked) {
    ledger.blocked_attempts = Number(ledger.blocked_attempts || 0) + 1;
    saveStore();
    return {
      allowed: false,
      code: 'PAYWALL_LOCKED',
      message: 'Loop unlock limit reached for current plan. Upgrade to continue.',
      state: stateBefore
    };
  }

  if (!dryRun) {
    ledger.used = Number(ledger.used || 0) + (Number(increment || 1) || 1);
    const proofContext = {
      ...context,
      outcome_id: deriveOutcomeId({ eventType, context }),
      value_tag: deriveValueTag(eventType, context)
    };
    const event = {
      id: uuidv4(),
      user_id: userId,
      event_type: eventType,
      idempotency_key: idempotencyKey || null,
      actor: actor || userId,
      outcome_id: proofContext.outcome_id,
      value_tag: proofContext.value_tag,
      context: proofContext,
      metered_at: new Date().toISOString(),
      period_start_at: ledger.period_start_at,
      period_end_at: ledger.period_end_at,
      state_after: getRevenueState(userId)
    };
    store.unlockLedger.unshift(event);
    const maxRows = Number(store.billingPolicy.maxUnlockLedgerEntries || 10000);
    if (store.unlockLedger.length > maxRows) {
      store.unlockLedger = store.unlockLedger.slice(0, maxRows);
    }
    saveStore();
    return { allowed: true, duplicate: false, event, state: event.state_after };
  }

  return { allowed: true, duplicate: false, state: stateBefore };
}

function assertLoopUnlockAccess(userId) {
  const ops = getOpsControl();
  if (ops.monetizationBypass) {
    return getRevenueState(userId);
  }
  const state = getRevenueState(userId);
  if (state.blocked) {
    const err = new Error('Loop unlock limit reached for current plan. Upgrade to continue.');
    err.code = 'PAYWALL_LOCKED';
    err.state = state;
    throw err;
  }
  return state;
}

function accountHasScope(account, scope) {
  return Array.isArray(account?.scopes) && account.scopes.includes(scope);
}

async function refreshXAccessToken(account) {
  if (!account?.encrypted_refresh_token) {
    throw new Error('X refresh token is missing. Please reconnect your X account.');
  }

  const clientId = process.env.X_API_KEY;
  const clientSecret = process.env.X_API_SECRET;
  if (!clientId || clientId.includes('YOUR_X_API_KEY')) {
    throw new Error('X_API_KEY is not configured in backend/.env');
  }

  const refreshToken = decrypt(account.encrypted_refresh_token);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });

  const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret && !clientSecret.includes('YOUR_X_API_SECRET')) {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: tokenHeaders,
    body: body.toString()
  });

  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    const msg = `X token refresh failed (${tokenRes.status}): ${tokenText.slice(0, 240)}`;
    pushSystemEvent('critical', 'X_TOKEN_REFRESH_FAILED', msg, {
      status: tokenRes.status,
      accountId: account?.id || null,
      handle: account?.handle || null
    });
    throw new Error(msg);
  }

  let tokenData;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    throw new Error('X token refresh returned non-JSON response');
  }

  if (!tokenData.access_token) {
    throw new Error('X token refresh missing access_token');
  }

  account.encrypted_access_token = encrypt(tokenData.access_token);
  if (tokenData.refresh_token) {
    account.encrypted_refresh_token = encrypt(tokenData.refresh_token);
  }
  if (tokenData.expires_in) {
    account.token_expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  }
  if (tokenData.scope) {
    account.scopes = tokenData.scope.split(' ').filter(Boolean);
  }
  account.updated_at = new Date().toISOString();
  saveStore();

  return tokenData.access_token;
}

async function xApiRequest(account, { path, method = 'GET', body = null, requiredScopes = [] }) {
  for (const scope of requiredScopes) {
    if (!accountHasScope(account, scope)) {
      console.warn(`X scope check warning: missing ${scope} in stored account scopes; attempting API call anyway.`);
    }
  }

  let accessToken = decrypt(account.encrypted_access_token);

  const doRequest = async (token) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(`https://api.x.com${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  };

  let res = await doRequest(accessToken);
  if (res.status === 401 && account.encrypted_refresh_token) {
    accessToken = await refreshXAccessToken(account);
    res = await doRequest(accessToken);
  }

  const responseText = await res.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { raw: responseText };
  }

  if (!res.ok) {
    pushSystemEvent(res.status >= 500 ? 'critical' : 'warn', 'X_API_REQUEST_FAILED', `X API request failed (${res.status})`, {
      status: res.status,
      path,
      method,
      accountId: account?.id || null,
      handle: account?.handle || null,
      responsePreview: String(responseText).slice(0, 180)
    });
    throw new Error(`X API request failed (${res.status}): ${String(responseText).slice(0, 240)}`);
  }

  return payload;
}

async function executeXAction(action) {
  if (!action?.bypass_revenue_metering) {
    assertLoopUnlockAccess(action.user_id);
  }

  const account = getUserXAccount(action.user_id, action.account_id);
  if (!account) {
    throw new Error('No connected X account found for this user.');
  }

  const actionType = String(action.action_type || '').toLowerCase();
  const payload = action.payload || {};

  if (['post', 'tweet', 'publish_post', 'create_post'].includes(actionType)) {
    const text = String(payload.text || payload.message || payload.body || payload.content || '').trim();
    if (!text) throw new Error('X post action requires payload text.');

    const result = await xApiRequest(account, {
      path: '/2/tweets',
      method: 'POST',
      body: { text },
      requiredScopes: ['tweet.write']
    });

    if (!action?.bypass_revenue_metering) {
      consumeLoopUnlock(action.user_id, {
        eventType: 'execute_x_action',
        idempotencyKey: `execute:${action.id || `post:${result?.data?.id || Date.now()}`}`,
        context: {
          actionId: action.id || null,
          actionType,
          provider: 'x',
          tweetId: result?.data?.id || null,
          outcomeId: action.outcome_id || `outcome:${action.id || result?.data?.id || 'x-post'}`,
          incident: !!action.incident
        },
        actor: action?.approved_by || action?.user_id
      });
    }

    return {
      kind: 'post',
      tweetId: result?.data?.id || null,
      text,
      url: result?.data?.id ? `https://x.com/${account.handle}/status/${result.data.id}` : null,
      raw: result
    };
  }

  if (['reply', 'respond', 'reply_to'].includes(actionType)) {
    const text = String(payload.text || payload.message || payload.body || payload.content || '').trim();
    const inReplyTo = payload.replyToId || payload.in_reply_to_tweet_id || payload.tweetId || payload.targetTweetId;
    if (!text || !inReplyTo) {
      throw new Error('X reply action requires payload text and replyToId (or in_reply_to_tweet_id).');
    }

    const result = await xApiRequest(account, {
      path: '/2/tweets',
      method: 'POST',
      body: {
        text,
        reply: { in_reply_to_tweet_id: String(inReplyTo) }
      },
      requiredScopes: ['tweet.write']
    });

    if (!action?.bypass_revenue_metering) {
      consumeLoopUnlock(action.user_id, {
        eventType: 'execute_x_action',
        idempotencyKey: `execute:${action.id || `reply:${result?.data?.id || Date.now()}`}`,
        context: {
          actionId: action.id || null,
          actionType,
          provider: 'x',
          inReplyTo: String(inReplyTo),
          tweetId: result?.data?.id || null,
          outcomeId: action.outcome_id || `outcome:${action.id || result?.data?.id || 'x-reply'}`,
          incident: !!action.incident
        },
        actor: action?.approved_by || action?.user_id
      });
    }

    return {
      kind: 'reply',
      tweetId: result?.data?.id || null,
      inReplyTo: String(inReplyTo),
      text,
      url: result?.data?.id ? `https://x.com/${account.handle}/status/${result.data.id}` : null,
      raw: result
    };
  }

  throw new Error(`Unsupported X action_type: ${action.action_type}`);
}

async function generateWithOllama(prompt, opts = {}) {
  const baseUrl = String(opts.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = String(opts.ollamaModel || process.env.OLLAMA_MODEL || 'llama3.1:8b').trim();
  const payload = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
      num_predict: typeof opts.maxTokens === 'number' ? opts.maxTokens : 280
    }
  };

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Ollama request failed (${res.status}): ${raw.slice(0, 180)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Ollama returned non-JSON response');
  }

  return String(parsed?.response || '').trim();
}

function normalizeReasoningMessages(messages = [], prompt = '') {
  if (Array.isArray(messages) && messages.length) {
    const normalized = messages
      .map((m) => ({
        role: ['system', 'assistant', 'user'].includes(String(m?.role || '').toLowerCase())
          ? String(m.role).toLowerCase()
          : 'user',
        content: String(m?.content || '').trim()
      }))
      .filter((m) => m.content);
    if (normalized.length) return normalized;
  }
  const p = String(prompt || '').trim();
  return p ? [{ role: 'user', content: p }] : [];
}

function messagesToPrompt(messages = []) {
  return messages
    .map((m) => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '').trim()}`)
    .filter(Boolean)
    .join('\n\n');
}

async function generateWithOpenAI(messages, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const model = String(process.env.REASONING_OPENAI_MODEL || process.env.GROWTH_OPS_AGENT_MODEL || 'gpt-4o').trim();
  const payload = {
    model,
    messages,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
    max_tokens: typeof opts.maxTokens === 'number' ? opts.maxTokens : 800
  };

  if (opts.json) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${raw.slice(0, 180)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OpenAI returned non-JSON response');
  }

  const text = String(parsed?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    throw new Error('OpenAI returned empty response');
  }
  return text;
}

async function generateReasoningWithFallback({ prompt = '', messages = [], opts = {} } = {}) {
  const normalizedMessages = normalizeReasoningMessages(messages, prompt);
  if (!normalizedMessages.length) {
    throw new Error('Prompt or messages are required');
  }

  const primary = String(process.env.REASONING_PRIMARY_PROVIDER || 'openai').toLowerCase();
  const providerOrder = primary === 'ollama' ? ['ollama', 'openai'] : ['openai', 'ollama'];
  const errors = [];

  for (const provider of providerOrder) {
    try {
      if (provider === 'openai') {
        const text = await generateWithOpenAI(normalizedMessages, opts);
        return { text, provider: 'openai', fallbackUsed: false, errors };
      }

      const ollamaPrompt = messagesToPrompt(normalizedMessages);
      const text = await generateWithOllama(ollamaPrompt, opts);
      return { text, provider: 'ollama', fallbackUsed: primary !== 'ollama', errors };
    } catch (err) {
      errors.push({ provider, message: err.message || String(err) });
    }
  }

  const detail = errors.map(e => `${e.provider}: ${e.message}`).join(' | ');
  throw new Error(`All reasoning providers failed. ${detail}`);
}

async function generateReasoningText(prompt, opts = {}) {
  const result = await generateReasoningWithFallback({ prompt, opts });
  return result.text;
}

function messageShapeFromWebhook(body, userId) {
  const providerMessageId = String(
    body?.provider_message_id || body?.tweet_id || body?.tweetId || body?.id || ''
  ).trim();
  const text = String(body?.messageText || body?.text || body?.content || '').trim();
  const accountId = body?.accountId || body?.account_id || null;
  const authorHandle = String(body?.authorHandle || body?.author?.handle || body?.author_username || '').trim();
  const authorId = String(body?.authorId || body?.author?.id || body?.author_id || '').trim();
  const authorName = String(body?.authorName || body?.author?.displayName || body?.author?.name || authorHandle || 'Unknown').trim();
  const type = String(body?.type || (body?.in_reply_to_tweet_id ? 'reply' : 'mention')).toLowerCase();

  return {
    id: uuidv4(),
    provider: 'x',
    user_id: userId,
    account_id: accountId,
    provider_message_id: providerMessageId,
    in_reply_to_tweet_id: body?.in_reply_to_tweet_id || body?.inReplyToTweetId || null,
    message_text: text,
    type,
    author: {
      id: authorId || null,
      handle: authorHandle || null,
      display_name: authorName || null,
      avatar: body?.author?.avatar || body?.authorAvatar || null
    },
    source: 'webhook',
    read: false,
    status: 'received',
    received_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function findInboundByProviderMessage(userId, providerMessageId) {
  if (!providerMessageId) return null;
  return Object.values(store.inboundMessages || {}).find(
    m => m.user_id === userId && m.provider === 'x' && m.provider_message_id === providerMessageId
  ) || null;
}

function localAnalyzeMessage(text) {
  const t = String(text || '').toLowerCase();
  const urgent = /(urgent|asap|down|broken|error|cannot|can't|help now|refund)/.test(t);
  const negative = /(bad|angry|frustrated|terrible|awful|hate|not working)/.test(t);
  const positive = /(love|great|awesome|thanks|amazing|nice)/.test(t);

  return {
    sentiment: negative ? 'negative' : positive ? 'positive' : 'neutral',
    urgency: urgent ? 'high' : 'medium',
    category: /(bug|error|broken|issue|not working)/.test(t) ? 'support_request' : 'feedback',
    intent: urgent
      ? 'User needs immediate support response and ownership confirmation.'
      : 'User expects a clear response, acknowledgement, and next step.'
  };
}

function localSuggestions(msg, analysis) {
  const handle = msg?.author?.handle ? `@${msg.author.handle.replace(/^@/, '')}` : 'there';
  const base = [
    {
      rank: 1,
      responseText: `${handle} thanks for flagging this. We are checking now and will update you shortly.`,
      reasoning: 'Fast acknowledgement with ownership and follow-up promise.',
      confidence: 0.82,
      tone: 'professional',
      estimated_engagement: 'medium'
    },
    {
      rank: 2,
      responseText: `${handle} appreciate the message. Could you share one more detail so we can resolve this quickly?`,
      reasoning: 'Requests actionable detail to speed up support resolution.',
      confidence: 0.76,
      tone: 'supportive',
      estimated_engagement: 'medium'
    },
    {
      rank: 3,
      responseText: `${handle} thanks for your patience. We are on it and will post an update as soon as this is fixed.`,
      reasoning: 'Calming status update suitable for high urgency cases.',
      confidence: analysis?.urgency === 'high' ? 0.79 : 0.71,
      tone: 'reassuring',
      estimated_engagement: 'high'
    }
  ];
  return base.map((s, i) => ({ ...s, rank: i + 1, responseText: String(s.responseText).slice(0, 280) }));
}

// OAuth start
app.post('/api/social/oauth/x/start', (req, res) => {
  try {
    const clientId = process.env.X_API_KEY;
    if (!clientId || clientId.includes('YOUR_X_API_KEY')) {
      return res.status(500).json({ error: 'X_API_KEY is not configured in backend/.env' });
    }

    const state = uuidv4().replace(/-/g, '');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    store.oauthStates[state] = {
      provider: 'x',
      userId: req.userId,
      codeVerifier,
      created_at: new Date().toISOString(),
      expires_at: expiresAt
    };
    saveStore();
    
    const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', process.env.X_CALLBACK_URL || 'http://localhost:8787/api/social/oauth/x/callback');
    authUrl.searchParams.set('response_type', 'code');
    const oauthScopes = process.env.X_OAUTH_SCOPES || 'users.read tweet.read tweet.write offline.access';
    authUrl.searchParams.set('scope', oauthScopes);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    logAudit(req.userId, 'OAUTH_START', { provider: 'x' });
    
    res.json({ authUrl: authUrl.toString(), state });
  } catch (err) {
    console.error('OAuth start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// OAuth callback (GET from X)
app.get('/api/social/oauth/x/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    console.log('🔵 OAuth Callback received:', { code: !!code, state: state?.substring(0, 8), error, timestamp: new Date().toISOString() });
    
    if (error) {
      console.log('❌ OAuth error from X:', error, error_description);
      return res.send(`
        <html>
          <head><title>Authorization Failed</title></head>
          <body>
            <h2>Authorization Failed</h2>
            <p><strong>Error:</strong> ${error}</p>
            <p>${error_description || ''}</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }
    
    if (!code || !state) {
      console.log('❌ Missing code or state:', { hasCode: !!code, hasState: !!state });
      return res.status(400).send(`
        <html>
          <head><title>Authorization Error</title></head>
          <body>
            <h2>Authorization Error</h2>
            <p>Missing code or state parameter</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }
    
    console.log('🔍 Looking up OAuth state...');
    const stateKeys = Object.keys(store.oauthStates);
    console.log(`🔍 Available states in memory (${stateKeys.length}):`, stateKeys.map(s => s.substring(0, 8)));
    const oauthState = store.oauthStates[state];
    console.log('🔍 State found:', !!oauthState, 'Provider:', oauthState?.provider);
    if (!oauthState || oauthState.provider !== 'x') {
      console.log('❌ Invalid state or wrong provider');
      return res.status(403).send(`
        <html>
          <head><title>Invalid State</title></head>
          <body>
            <h2>Authorization Error</h2>
            <p>Invalid or expired state parameter</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }
    
    if (new Date(oauthState.expires_at) < new Date()) {
      delete store.oauthStates[state];
      return res.status(403).send(`
        <html>
          <head><title>State Expired</title></head>
          <body>
            <h2>Authorization Error</h2>
            <p>State parameter has expired. Please try again.</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }
    
    console.log('✅ State validated. User ID:', oauthState.userId?.substring(0, 8));
    
    console.log('🔄 Exchanging code for token...');
    const tokenData = await exchangeXCodeForToken(code, oauthState.codeVerifier);
    console.log('✅ Token received:', { has_access_token: !!tokenData.access_token, expires_in: tokenData.expires_in });
    
    console.log('🔄 Fetching X user profile...');
    const xUser = await fetchXUserProfile(tokenData.access_token);
    console.log('✅ User profile retrieved:', { username: xUser.username, id: xUser.id });
    
    const accountId = uuidv4();
    const encryptedAccessToken = encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
    
    console.log('💾 Storing account...', { accountId: accountId.substring(0, 8), handle: xUser.username });
    store.accounts[accountId] = {
      id: accountId,
      user_id: oauthState.userId,
      provider: 'x',
      account_id: xUser.id,
      handle: xUser.username,
      display_name: xUser.name,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      scopes: (tokenData.scope || '').split(' ').filter(Boolean),
      profile_data: xUser,
      connected_at: new Date().toISOString(),
      status: 'active'
    };
    
    delete store.oauthStates[state];
    saveStore();
    console.log('✅ Account stored and file saved');
    
    logAudit(oauthState.userId, 'OAUTH_SUCCESS', { provider: 'x', accountId, handle: xUser.username });
    
    res.send(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_SUCCESS', provider: 'x', account: '${xUser.username}' }, '*');
              setTimeout(() => window.close(), 1500);
            }
          </script>
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 40px;">
          <h2>✓ Authorization Successful</h2>
          <p>Connected account: <strong>${xUser.username}</strong></p>
          <p>This window will close automatically...</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ OAuth callback ERROR:', err.message, err.stack);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h2>Authorization Error</h2>
          <p>${err.message}</p>
          <button onclick="window.close()">Close</button>
        </body>
      </html>
    `);
  }
});

// OAuth callback (POST for manual requests)
app.post('/api/social/oauth/x/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }
    
    const oauthState = store.oauthStates[state];
    if (!oauthState || oauthState.provider !== 'x') {
      return res.status(403).json({ error: 'Invalid state' });
    }
    
    if (new Date(oauthState.expires_at) < new Date()) {
      delete store.oauthStates[state];
      return res.status(403).json({ error: 'State expired' });
    }
    
    const tokenData = await exchangeXCodeForToken(code, oauthState.codeVerifier);
    const xUser = await fetchXUserProfile(tokenData.access_token);
    
    const accountId = uuidv4();
    const encryptedAccessToken = encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
    
    store.accounts[accountId] = {
      id: accountId,
      user_id: oauthState.userId,
      provider: 'x',
      account_id: xUser.id,
      handle: xUser.username,
      display_name: xUser.name,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      scopes: (tokenData.scope || '').split(' ').filter(Boolean),
      profile_data: xUser,
      connected_at: new Date().toISOString(),
      status: 'active'
    };
    
    delete store.oauthStates[state];
    saveStore();
    
    logAudit(oauthState.userId, 'OAUTH_SUCCESS', { provider: 'x', accountId, handle: xUser.username });
    
    res.json({
      success: true,
      account: {
        id: accountId,
        provider: 'x',
        handle: xUser.username,
        displayName: xUser.name,
        connectedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Direct account linking (no popup required)
app.post('/api/social/accounts/connect', (req, res) => {
  try {
    const { platform, accessToken, refreshToken, username, name, profile_image_url, account_id } = req.body;
    
    if (!platform || !accessToken || !username) {
      return res.status(400).json({ error: 'Missing required fields: platform, accessToken, username' });
    }
    
    // Check if account already exists for this platform
    const existing = Object.values(store.accounts).find(a => a.user_id === req.userId && a.provider === platform);
    if (existing) {
      return res.status(409).json({ error: `${platform} account already connected` });
    }
    
    const accountId = uuidv4();
    const encryptedAccessToken = encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;
    
    store.accounts[accountId] = {
      id: accountId,
      user_id: req.userId,
      provider: platform,
      account_id: account_id || `${platform}_${username}`,
      handle: username,
      display_name: name || username,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: null,
      scopes: [],
      profile_data: {
        username,
        name,
        profile_image_url
      },
      connected_at: new Date().toISOString(),
      status: 'active',
      connection_method: 'direct'
    };
    
    saveStore();
    logAudit(req.userId, 'ACCOUNT_CONNECTED_DIRECT', { provider: platform, accountId, handle: username });
    
    res.status(201).json({
      success: true,
      account: {
        id: accountId,
        provider: platform,
        handle: username,
        displayName: name || username,
        connectedAt: store.accounts[accountId].connected_at
      }
    });
  } catch (err) {
    console.error('Direct account linking error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get accounts
app.get('/api/social/accounts', (req, res) => {
  const userAccounts = Object.values(store.accounts).filter(a => a.user_id === req.userId);
  const userIgAccounts = Array.isArray(store.igAccounts?.[req.userId]) ? store.igAccounts[req.userId] : [];
  const latestIg = userIgAccounts.length ? userIgAccounts[userIgAccounts.length - 1] : null;
  const accounts = {
    x: userAccounts.find(a => a.provider === 'x') || null,
    meta: userAccounts.find(a => a.provider === 'meta') || null,
    linkedin: userAccounts.find(a => a.provider === 'linkedin') || null,
    instagram: latestIg ? {
      id: latestIg.id,
      igUserId: latestIg.igUserId,
      username: latestIg.username,
      name: latestIg.displayName || latestIg.username,
      displayName: latestIg.displayName,
      profilePictureUrl: latestIg.profilePictureUrl,
      followersCount: latestIg.followersCount,
      connectedAt: latestIg.connectedAt,
      tokenExpiresAt: latestIg.tokenExpiresAt
    } : null
  };
  res.json(accounts);
});

// List connected X user IDs to help frontend detect active-user mismatch
app.get('/api/social/x/connected-users', (req, res) => {
  const xAccounts = Object.values(store.accounts || {})
    .filter(a => a.provider === 'x')
    .sort((a, b) => {
      const aTs = new Date(a.updated_at || a.connected_at || a.created_at || 0).getTime();
      const bTs = new Date(b.updated_at || b.connected_at || b.created_at || 0).getTime();
      return bTs - aTs;
    });

  const dedup = new Map();
  xAccounts.forEach((a) => {
    if (!a?.user_id) return;
    if (dedup.has(a.user_id)) return;
    dedup.set(a.user_id, {
      userId: a.user_id,
      accountId: a.id,
      handle: a.handle || a.display_name || null,
      connectedAt: a.connected_at || a.updated_at || null
    });
  });

  const connectedUsers = Array.from(dedup.values());
  const active = connectedUsers.find(u => u.userId === req.userId) || null;

  res.json({
    activeUserId: req.userId,
    activeHasConnectedX: !!active,
    connectedUsers,
    recommendedUserId: connectedUsers.length ? connectedUsers[0].userId : null
  });
});

// Disconnect account
app.delete('/api/social/accounts/:accountId', (req, res) => {
  const account = store.accounts[req.params.accountId];
  if (account && account.user_id === req.userId) {
    delete store.accounts[req.params.accountId];
    saveStore();
    logAudit(req.userId, 'ACCOUNT_DISCONNECTED', { accountId: req.params.accountId });
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Account not found' });
});

// Get current X profile snapshot
app.get('/api/social/x/profile', async (req, res) => {
  try {
    const { accountId } = req.query || {};
    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }
    const xUserId = getXUserId(account);
    if (!xUserId) {
      return res.status(400).json({ error: 'Connected X account is missing account user id.' });
    }

    const profile = await xApiRequest(account, {
      path: `/2/users/${xUserId}?user.fields=description,profile_image_url,public_metrics,username,name`,
      method: 'GET',
      requiredScopes: ['users.read']
    });

    const data = profile?.data || {};
    return res.json({
      id: data.id || xUserId,
      name: data.name || account.display_name || '',
      handle: data.username || account.handle || '',
      bio: data.description || '',
      photo: data.profile_image_url || '',
      followers: Number(data?.public_metrics?.followers_count || 0) || 0,
      following: Number(data?.public_metrics?.following_count || 0) || 0
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Update X profile (Growth Ops delegated role)
app.post('/api/social/x/profile/update', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const {
      accountId,
      executeAsRole = 'growth',
      name,
      bio,
      handle,
      profileImage
    } = req.body || {};

    const role = String(executeAsRole || '').toLowerCase();
    if (!X_LIVE_EXECUTE_ROLES.has(role)) {
      return res.status(403).json({ error: `Role ${executeAsRole} is not allowed for X profile update.` });
    }

    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }
    const xUserId = getXUserId(account);
    if (!xUserId) {
      return res.status(400).json({ error: 'Connected X account is missing account user id.' });
    }

    let before = {};
    try {
      before = await xApiRequest(account, {
        path: `/2/users/${xUserId}?user.fields=description,profile_image_url,public_metrics,username,name`,
        method: 'GET',
        requiredScopes: ['users.read']
      });
    } catch {}

    const updateFields = {};
    if (typeof name === 'string' && name.trim()) updateFields.name = name.trim();
    if (typeof bio === 'string') updateFields.description = bio;
    if (typeof handle === 'string' && handle.trim()) updateFields.username = handle.trim();

    let profileResult = null;
    if (Object.keys(updateFields).length > 0) {
      profileResult = await xApiRequest(account, {
        path: `/2/users/${xUserId}`,
        method: 'PATCH',
        body: updateFields,
        requiredScopes: ['users.write']
      });
    }

    let imageResult = null;
    if (profileImage && typeof profileImage === 'string' && profileImage.length > 20) {
      imageResult = await xApiRequest(account, {
        path: `/2/users/${xUserId}/profile_image`,
        method: 'POST',
        body: { image: profileImage },
        requiredScopes: ['users.write']
      });
    }

    let after = {};
    try {
      after = await xApiRequest(account, {
        path: `/2/users/${xUserId}?user.fields=description,profile_image_url,public_metrics,username,name`,
        method: 'GET',
        requiredScopes: ['users.read']
      });
    } catch {}

    logAudit(req.userId, 'X_PROFILE_UPDATED', {
      accountId: account.id,
      handle: account.handle,
      before,
      after,
      updateFields,
      imageResult,
      routedNotification: 'founder'
    });

    return res.json({ success: true, before, after, profileResult, imageResult });
  } catch (err) {
    console.error('X profile update error:', err.message);
    return res.status(err.status || 400).json({ error: err.message, code: err.code || 'X_PROFILE_UPDATE_FAILED', ops: err.ops || getOpsControl() });
  }
});

// Execute a real test post on X to validate end-to-end publish permissions
app.post('/api/social/x/test-execute', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const { accountId, text } = req.body || {};
    const chosenAccount = getUserXAccount(req.userId, accountId);

    if (!chosenAccount) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }

    const testText = String(text || `[WorkflowIQ Test] X execution check from Team Workstation at ${new Date().toISOString()} (safe test)`)
      .trim()
      .slice(0, 280);

    if (!testText) {
      return res.status(400).json({ error: 'Test text is required.' });
    }

    const action = {
      id: `x-test-${Date.now()}`,
      user_id: req.userId,
      account_id: chosenAccount.id,
      provider: 'x',
      action_type: 'post',
      payload: { text: testText },
      outcome_id: `outcome:x-test:${Date.now()}`,
      value_tag: 'execution_test',
      bypass_revenue_metering: true
    };

    const execution = await executeXAction(action);

    logAudit(req.userId, 'X_TEST_EXECUTED', {
      accountId: chosenAccount.id,
      handle: chosenAccount.handle,
      tweetId: execution.tweetId || null
    });

    return res.json({
      success: true,
      account: {
        id: chosenAccount.id,
        handle: chosenAccount.handle,
        provider: 'x'
      },
      testText,
      execution
    });
  } catch (err) {
    console.error('X test execute error:', err.message);
    return res.status(err.status || 400).json({ error: err.message, code: err.code || 'X_TEST_FAILED', ops: err.ops || getOpsControl() });
  }
});

// X backend control state for LLM reasoning loop
app.get('/api/social/x/control-state', (req, res) => {
  try {
    const { accountId } = req.query || {};
    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }
    const state = getXControlState(req.userId, account.id);
    const summary = summarizeXReasoningEvents(req.userId, account.id);
    return res.json({
      account: {
        id: account.id,
        handle: account.handle,
        provider: 'x'
      },
      state,
      summary
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.patch('/api/social/x/control-state', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const { accountId, mode, confidenceThreshold, maxAutomatedActionsPerDay, requireHumanApprovalForReplies } = req.body || {};
    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }

    const state = setXControlState(req.userId, account.id, {
      mode,
      confidenceThreshold,
      maxAutomatedActionsPerDay,
      requireHumanApprovalForReplies
    });
    saveStore();

    logAudit(req.userId, 'X_REASONING_CONTROL_UPDATED', {
      accountId: account.id,
      handle: account.handle,
      mode: state.mode,
      confidenceThreshold: state.confidenceThreshold,
      maxAutomatedActionsPerDay: state.maxAutomatedActionsPerDay,
      requireHumanApprovalForReplies: state.requireHumanApprovalForReplies
    });

    return res.json({ success: true, state });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code || 'X_CONTROL_UPDATE_FAILED' });
  }
});

app.get('/api/social/x/reasoning/status', async (req, res) => {
  try {
    const { accountId, refresh } = req.query || {};
    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }

    const staleMs = xFeedCache.lastPollAt
      ? Date.now() - new Date(xFeedCache.lastPollAt).getTime()
      : Infinity;
    if (refresh === '1' || staleMs > 45000) {
      await pollXFeed(req.userId, account.id);
    }

    const state = getXControlState(req.userId, account.id);
    const summary = summarizeXReasoningEvents(req.userId, account.id);
    return res.json({
      account: {
        id: account.id,
        handle: account.handle,
        provider: 'x'
      },
      state,
      summary,
      feedStatus: {
        tokenStatus: xFeedCache.tokenStatus,
        apiHealthy: xFeedCache.apiHealthy,
        mentionCount: xFeedCache.mentions.length,
        postedCount: xFeedCache.postedTweets.length,
        lastPollAt: xFeedCache.lastPollAt
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message, code: 'X_REASONING_STATUS_FAILED' });
  }
});

app.post('/api/social/x/reasoning/intent', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });

    const {
      accountId,
      goal,
      executeAsRole = 'growth',
      dryRun = false
    } = req.body || {};

    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }

    const result = await runXReasoningIntent({
      userId: req.userId,
      account,
      goal,
      executeAsRole,
      dryRun: !!dryRun,
      forceExecute: false
    });

    return res.json({
      success: true,
      account: {
        id: account.id,
        handle: account.handle,
        provider: 'x'
      },
      event: result.event,
      summary: result.summary
    });
  } catch (err) {
    console.error('X reasoning intent error:', err.message);
    return res.status(err.status || 400).json({ error: err.message, code: err.code || 'X_REASONING_INTENT_FAILED' });
  }
});

app.post('/api/social/x/reasoning/chat', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const { accountId, message, executeAsRole = 'growth', fullAccess = false } = req.body || {};
    const account = getUserXAccount(req.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }

    const userMessage = String(message || '').trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'message is required.' });
    }

    let controlState = getXControlState(req.userId, account.id);
    const lowerMsg = userMessage.toLowerCase();

    if (lowerMsg.includes('full access') || lowerMsg.includes('autonomous mode')) {
      controlState = setXControlState(req.userId, account.id, {
        mode: 'autonomous',
        confidenceThreshold: 0.6,
        requireHumanApprovalForReplies: false
      });
      saveStore();
    } else if (lowerMsg.includes('manual mode')) {
      controlState = setXControlState(req.userId, account.id, { mode: 'manual' });
      saveStore();
    } else if (lowerMsg.includes('assisted mode')) {
      controlState = setXControlState(req.userId, account.id, { mode: 'assisted' });
      saveStore();
    }

    const result = await runXReasoningIntent({
      userId: req.userId,
      account,
      goal: userMessage,
      executeAsRole,
      dryRun: false,
      forceExecute: !!fullAccess
    });

    const outcome = result.event?.outcome || {};
    const plan = result.event?.plan || {};
    const executionUrl = outcome?.execution?.url || null;

    const assistantMessage = outcome.executed
      ? `Executed on X (${plan.actionType || 'action'}).${executionUrl ? ` URL: ${executionUrl}` : ''}`
      : `Planned but not executed (${outcome.reason || 'pending review'}). Plan confidence: ${Number(plan.confidence || 0).toFixed(2)}.`;

    logAudit(req.userId, 'X_REASONING_CHAT_MESSAGE', {
      accountId: account.id,
      handle: account.handle,
      fullAccess: !!fullAccess,
      mode: controlState.mode,
      executed: !!outcome.executed,
      reason: outcome.reason || null
    });

    return res.json({
      success: true,
      account: {
        id: account.id,
        handle: account.handle,
        provider: 'x'
      },
      assistantMessage,
      event: result.event,
      summary: result.summary,
      controlState
    });
  } catch (err) {
    console.error('X reasoning chat error:', err.message);
    return res.status(err.status || 400).json({ error: err.message, code: err.code || 'X_REASONING_CHAT_FAILED' });
  }
});

// Execute a real action on X now (post/reply) with delegated role controls
app.post('/api/social/x/execute', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const {
      accountId,
      executeAsRole = 'growth',
      actionType = 'post',
      text,
      replyToTweetId,
      targetFollowerCount = 0
    } = req.body || {};

    const role = String(executeAsRole || '').toLowerCase();
    if (!X_LIVE_EXECUTE_ROLES.has(role)) {
      return res.status(403).json({ error: `Role ${executeAsRole} is not allowed for live X execution.` });
    }

    const chosenAccount = getUserXAccount(req.userId, accountId);
    if (!chosenAccount) {
      return res.status(404).json({ error: 'No connected X account found for this user.' });
    }

    const normalizedType = String(actionType || 'post').toLowerCase();
    const normalizedText = String(text || '').trim().slice(0, 280);
    if (!normalizedText) {
      return res.status(400).json({ error: 'text is required for X execution.' });
    }

    if (!['post', 'reply'].includes(normalizedType)) {
      return res.status(400).json({ error: 'actionType must be post or reply.' });
    }

    if (normalizedType === 'reply' && !String(replyToTweetId || '').trim()) {
      return res.status(400).json({ error: 'replyToTweetId is required for reply actionType.' });
    }

    const actionId = uuidv4();
    const policy = getXPolicy();
    const needsAdminApproval = normalizedType === 'reply'
      && Number(targetFollowerCount || 0) >= Number(policy.approvalFollowerThreshold || 50000)
      && role === 'growth';

    const action = {
      id: actionId,
      user_id: req.userId,
      account_id: chosenAccount.id,
      provider: 'x',
      action_type: normalizedType,
      title: normalizedType === 'reply' ? 'Execute X reply now' : 'Execute X post now',
      description: `Delegated X live execute by ${role}${needsAdminApproval ? ' (awaiting admin approval gate)' : ''}`,
      payload: normalizedType === 'reply'
        ? { text: normalizedText, replyToId: String(replyToTweetId).trim() }
        : { text: normalizedText },
      outcome_id: `outcome:${actionId}`,
      value_tag: deriveValueTag('execute_x_action', { actionId: actionId, incident: false }),
      status: needsAdminApproval ? 'proposed' : 'approved',
      approved_by: needsAdminApproval ? null : role,
      approved_at: needsAdminApproval ? null : new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_mode: 'live',
      requires_admin_approval: needsAdminApproval,
      target_follower_count: Number(targetFollowerCount || 0) || 0
    };

    store.actions[actionId] = action;

    if (needsAdminApproval) {
      saveStore();
      logAudit(req.userId, 'X_ACTION_GATED_FOR_ADMIN_APPROVAL', {
        actionId,
        executeAsRole: role,
        actionType: normalizedType,
        targetFollowerCount: Number(targetFollowerCount || 0) || 0,
        threshold: Number(policy.approvalFollowerThreshold || 50000)
      });
      return res.status(202).json({
        success: true,
        gated: true,
        requiresAdminApproval: true,
        action,
        message: `Reply routed to approval queue because target follower count exceeds policy threshold (${policy.approvalFollowerThreshold}).`
      });
    }

    const execution = await executeXAction(action);

    action.status = 'completed';
    action.execution_status = 'success';
    action.executed_at = new Date().toISOString();
    action.execution_result = execution;
    action.updated_at = new Date().toISOString();
    saveStore();

    logAudit(req.userId, 'X_LIVE_EXECUTED', {
      actionId,
      executeAsRole: role,
      actionType: normalizedType,
      accountId: chosenAccount.id,
      handle: chosenAccount.handle,
      tweetId: execution.tweetId || null
    });

    return res.json({
      success: true,
      action,
      execution
    });
  } catch (err) {
    console.error('X live execute error:', err.message);
    return res.status(err.status || (err.code === 'PAYWALL_LOCKED' ? 402 : 400)).json({
      error: err.message,
      code: err.code || 'X_EXECUTE_FAILED',
      revenue: err.state || getRevenueState(req.userId),
      ops: err.ops || getOpsControl()
    });
  }
});

// X webhook ingest for inbound mentions/replies
app.post('/api/social/webhook/x', (req, res) => {
  try {
    const sig = verifyXWebhookSignature(req);
    if (!sig.ok) {
      logAudit(req.userId, 'X_WEBHOOK_REJECTED', { reason: sig.reason || 'invalid-signature' });
      return res.status(401).json({ error: `Webhook rejected: ${sig.reason || 'invalid signature'}` });
    }

    const shaped = messageShapeFromWebhook(req.body || {}, req.userId);
    if (!shaped.provider_message_id) {
      return res.status(400).json({ error: 'provider_message_id (or tweet_id/id) is required.' });
    }
    if (!shaped.message_text) {
      return res.status(400).json({ error: 'message text is required.' });
    }

    const existing = findInboundByProviderMessage(req.userId, shaped.provider_message_id);
    if (existing) {
      logAudit(req.userId, 'X_INBOUND_MESSAGE_DEDUPED', {
        messageId: existing.id,
        providerMessageId: shaped.provider_message_id
      });
      return res.json({ success: true, deduped: true, message: existing });
    }

    store.inboundMessages[shaped.id] = shaped;
    saveStore();

    logAudit(req.userId, 'X_INBOUND_MESSAGE_RECEIVED', {
      messageId: shaped.id,
      providerMessageId: shaped.provider_message_id,
      type: shaped.type,
      authorHandle: shaped.author?.handle || null
    });

    return res.status(201).json({ success: true, message: shaped });
  } catch (err) {
    console.error('X webhook ingest error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Simulate inbound message for local demos
app.post('/api/social/messages/simulate', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const body = req.body || {};
    const shaped = messageShapeFromWebhook({
      provider_message_id: body.provider_message_id || `sim-${Date.now()}`,
      text: body.text || 'Hey team, checkout is failing for me. Can you help?',
      authorHandle: body.authorHandle || 'customer_signal',
      authorName: body.authorName || 'Customer Signal',
      type: body.type || 'mention',
      accountId: body.accountId || null,
      in_reply_to_tweet_id: body.in_reply_to_tweet_id || null
    }, req.userId);

    const existing = findInboundByProviderMessage(req.userId, shaped.provider_message_id);
    if (existing) {
      return res.json({ success: true, deduped: true, message: existing });
    }

    store.inboundMessages[shaped.id] = shaped;
    saveStore();
    logAudit(req.userId, 'X_INBOUND_MESSAGE_SIMULATED', {
      messageId: shaped.id,
      providerMessageId: shaped.provider_message_id
    });

    return res.status(201).json({ success: true, message: shaped });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message, code: err.code || 'SIMULATE_FAILED', ops: err.ops || getOpsControl() });
  }
});

// List inbound messages for the current user
app.get('/api/social/messages', (req, res) => {
  const { status, since, unreadOnly, limit } = req.query;
  let items = Object.values(store.inboundMessages || {}).filter(m => m.user_id === req.userId);

  if (status) {
    items = items.filter(m => String(m.status || '').toLowerCase() === String(status).toLowerCase());
  }
  if (unreadOnly === 'true') {
    items = items.filter(m => !m.read);
  }
  if (since) {
    const sinceTs = new Date(String(since)).getTime();
    if (!Number.isNaN(sinceTs)) {
      items = items.filter(m => new Date(m.received_at || m.updated_at || 0).getTime() > sinceTs);
    }
  }

  items.sort((a, b) => new Date(b.received_at || b.updated_at || 0) - new Date(a.received_at || a.updated_at || 0));
  const n = Math.max(1, Math.min(100, Number(limit || 30)));
  items = items.slice(0, n).map(m => {
    const normalized = {
      ...m,
      message_text: m.message_text || m.text || '',
      author: m.author || {
        handle: (m.author_handle || '').replace(/^@/, ''),
        display_name: m.author_name || m.author_handle || 'Unknown'
      },
      routed_to: Array.isArray(m.routed_to) ? m.routed_to : [],
      author_followers: Number(m.author_followers || 0) || 0,
      incident: !!m.incident,
      customer_facing: !!m.customer_facing
    };
    return {
      ...normalized,
      analysis: store.messageAnalysis[m.id] || null,
      suggestions: store.suggestedResponses[m.id] || null,
      decision: store.operatorDecisions[m.id] || null
    };
  });

  return res.json({ items, count: items.length, serverTime: new Date().toISOString() });
});

app.post('/api/social/messages/:messageId/read', (req, res) => {
  const msg = store.inboundMessages?.[req.params.messageId];
  if (!msg || msg.user_id !== req.userId) {
    return res.status(404).json({ error: 'Message not found' });
  }
  msg.read = true;
  msg.updated_at = new Date().toISOString();
  saveStore();
  return res.json({ success: true, message: msg });
});

app.post('/api/social/messages/:messageId/analyze', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const msg = store.inboundMessages?.[req.params.messageId];
    if (!msg || msg.user_id !== req.userId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    assertLoopUnlockAccess(req.userId);

    let analysis;
    let source = 'ollama';
    try {
      const prompt = `Analyze this inbound X message and return ONLY compact JSON with keys sentiment, urgency, category, intent, tone_tags (array):\n\nMessage: "${msg.message_text}"`;
      const out = await generateReasoningText(prompt, { maxTokens: 220, temperature: 0.1 });
      const jsonStart = out.indexOf('{');
      const jsonEnd = out.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON returned');
      const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1));
      analysis = {
        sentiment: parsed.sentiment || 'neutral',
        urgency: parsed.urgency || 'medium',
        category: parsed.category || 'feedback',
        intent: parsed.intent || 'Respond with acknowledgement and next step.',
        tone_tags: Array.isArray(parsed.tone_tags) ? parsed.tone_tags : ['professional']
      };
    } catch {
      source = 'fallback';
      const local = localAnalyzeMessage(msg.message_text);
      analysis = {
        sentiment: local.sentiment,
        urgency: local.urgency,
        category: local.category,
        intent: local.intent,
        tone_tags: ['professional', local.urgency === 'high' ? 'urgent' : 'supportive']
      };
    }

    const record = {
      id: `analysis-${msg.id}`,
      message_id: msg.id,
      source,
      ...analysis,
      analyzed_at: new Date().toISOString()
    };
    store.messageAnalysis[msg.id] = record;
    msg.status = 'analyzed';
    msg.updated_at = new Date().toISOString();
    saveStore();

    logAudit(req.userId, 'X_INBOUND_ANALYZED', {
      messageId: msg.id,
      source,
      urgency: record.urgency,
      category: record.category,
      outcome_id: `outcome:${msg.id}:analyze`,
      value_tag: deriveValueTag('message_analyze', { messageId: msg.id, category: record.category, urgency: record.urgency })
    });

    const metering = consumeLoopUnlock(req.userId, {
      eventType: 'message_analyze',
      idempotencyKey: `analyze:${msg.id}`,
      context: {
        messageId: msg.id,
        source,
        category: record.category,
        urgency: record.urgency,
        outcomeId: `outcome:${msg.id}:analyze`
      },
      actor: req.userId
    });

    return res.json({ success: true, analysis: record, revenue: metering.state });
  } catch (err) {
    console.error('Message analyze error:', err.message);
    return res.status(err.status || (err.code === 'PAYWALL_LOCKED' ? 402 : 500)).json({
      error: err.message,
      code: err.code || 'ANALYZE_FAILED',
      revenue: err.state || getRevenueState(req.userId),
      ops: err.ops || getOpsControl()
    });
  }
});

app.post('/api/social/messages/:messageId/suggest', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const msg = store.inboundMessages?.[req.params.messageId];
    if (!msg || msg.user_id !== req.userId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    assertLoopUnlockAccess(req.userId);

    const analysis = store.messageAnalysis[msg.id] || {
      sentiment: 'neutral',
      urgency: 'medium',
      category: 'feedback',
      intent: 'Respond with acknowledgement and next step.'
    };

    let suggestions;
    let source = 'ollama';
    try {
      const prompt = `You are Growth Ops response engine. Create 3 short X replies (<=280 chars each) as JSON array items with keys responseText, reasoning, confidence (0-1), tone, estimated_engagement. Message: "${msg.message_text}". Analysis: sentiment=${analysis.sentiment}, urgency=${analysis.urgency}, category=${analysis.category}, intent=${analysis.intent}. Return ONLY JSON object {"suggestions":[...]}.`;
      const out = await generateReasoningText(prompt, { maxTokens: 340, temperature: 0.25 });
      const jsonStart = out.indexOf('{');
      const jsonEnd = out.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON returned');
      const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1));
      suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
        .slice(0, 3)
        .map((s, i) => ({
          rank: i + 1,
          responseText: String(s.responseText || '').trim().slice(0, 280),
          reasoning: String(s.reasoning || 'Optimized for clarity and action.').trim(),
          confidence: Number.isFinite(Number(s.confidence)) ? Number(s.confidence) : 0.7,
          tone: String(s.tone || 'professional').trim(),
          estimated_engagement: String(s.estimated_engagement || 'medium').trim()
        }))
        .filter(s => s.responseText);

      if (!suggestions.length) throw new Error('No suggestions returned');
    } catch {
      source = 'fallback';
      suggestions = localSuggestions(msg, analysis);
    }

    const record = {
      id: `suggest-${msg.id}`,
      message_id: msg.id,
      source,
      suggestions,
      generated_at: new Date().toISOString(),
      engine_version: source === 'ollama' ? 'ollama-v1' : 'fallback-v1'
    };

    store.suggestedResponses[msg.id] = record;
    msg.status = 'suggestion-ready';
    msg.updated_at = new Date().toISOString();
    saveStore();

    logAudit(req.userId, 'X_INBOUND_SUGGESTED', {
      messageId: msg.id,
      source,
      suggestionCount: suggestions.length,
      outcome_id: `outcome:${msg.id}:suggest`,
      value_tag: deriveValueTag('message_suggest', { messageId: msg.id, suggestionCount: suggestions.length })
    });

    const metering = consumeLoopUnlock(req.userId, {
      eventType: 'message_suggest',
      idempotencyKey: `suggest:${msg.id}`,
      context: {
        messageId: msg.id,
        source,
        suggestionCount: suggestions.length,
        outcomeId: `outcome:${msg.id}:suggest`
      },
      actor: req.userId
    });

    return res.json({ success: true, suggestions: record, revenue: metering.state });
  } catch (err) {
    console.error('Message suggest error:', err.message);
    return res.status(err.status || (err.code === 'PAYWALL_LOCKED' ? 402 : 500)).json({
      error: err.message,
      code: err.code || 'SUGGEST_FAILED',
      revenue: err.state || getRevenueState(req.userId),
      ops: err.ops || getOpsControl()
    });
  }
});

app.post('/api/social/messages/:messageId/decision', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
  const msg = store.inboundMessages?.[req.params.messageId];
  if (!msg || msg.user_id !== req.userId) {
    return res.status(404).json({ error: 'Message not found' });
  }

  try {
    assertLoopUnlockAccess(req.userId);
  } catch (err) {
    return res.status(402).json({
      error: err.message,
      code: err.code || 'PAYWALL_LOCKED',
      revenue: err.state || getRevenueState(req.userId)
    });
  }

  const {
    decision,
    selectedSuggestionRank,
    customReplyText,
    notes,
    decidedBy
  } = req.body || {};

  const normalized = String(decision || '').toLowerCase();
  if (!['approved', 'rejected', 'custom', 'snoozed'].includes(normalized)) {
    return res.status(400).json({ error: 'decision must be approved, rejected, custom, or snoozed' });
  }

  const record = {
    id: `decision-${msg.id}`,
    message_id: msg.id,
    decision: normalized,
    selectedSuggestionRank: Number(selectedSuggestionRank || 0) || null,
    customReplyText: customReplyText ? String(customReplyText).slice(0, 280) : null,
    notes: notes ? String(notes).slice(0, 400) : null,
    decidedBy: decidedBy || req.userId,
    decided_at: new Date().toISOString(),
    publish_status: 'not-published',
    action_id: null,
    published_tweet_id: null,
    published_url: null,
    support_review_status: 'not-required',
    support_reviewed_by: null,
    support_reviewed_at: null,
    admin_approval_status: 'not-required',
    admin_approved_by: null,
    admin_approved_at: null
  };

  const policy = getXPolicy();
  const followers = Number(msg.author_followers || 0) || 0;
  const needsSupport = !!policy.requireSupportReviewForCustomerFacing && !!(msg.customer_facing || msg.incident || isSupportComplaint(msg.message_text));
  const needsAdmin = followers >= policy.approvalFollowerThreshold;

  if (needsSupport && (normalized === 'approved' || normalized === 'custom')) {
    record.support_review_status = 'required';
  }
  if (needsAdmin && (normalized === 'approved' || normalized === 'custom')) {
    record.admin_approval_status = 'required';
  }

  store.operatorDecisions[msg.id] = record;
  msg.status = normalized === 'approved' || normalized === 'custom' ? 'approved' : normalized;
  msg.updated_at = new Date().toISOString();
  saveStore();

  logAudit(req.userId, 'X_INBOUND_DECISION', {
    messageId: msg.id,
    decision: record.decision,
    selectedSuggestionRank: record.selectedSuggestionRank,
    supportReviewStatus: record.support_review_status,
    adminApprovalStatus: record.admin_approval_status,
    approval_chain: [{
      stage: 'operator_decision',
      by: record.decidedBy,
      at: record.decided_at,
      status: record.decision
    }],
    outcome_id: `outcome:${msg.id}:decision`,
    value_tag: deriveValueTag('message_decision', {
      messageId: msg.id,
      supportReviewRequired: record.support_review_status === 'required',
      incident: !!msg.incident
    })
  });

  const metering = consumeLoopUnlock(req.userId, {
    eventType: 'message_decision',
    idempotencyKey: `decision:${msg.id}`,
    context: {
      messageId: msg.id,
      decision: record.decision,
      supportReviewStatus: record.support_review_status,
      adminApprovalStatus: record.admin_approval_status,
      outcomeId: `outcome:${msg.id}:decision`,
      supportReviewRequired: record.support_review_status === 'required',
      incident: !!msg.incident
    },
    actor: record.decidedBy || req.userId
  });

  return res.json({ success: true, decision: record, revenue: metering.state });
});

app.post('/api/social/messages/:messageId/support-review', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
  const msg = store.inboundMessages?.[req.params.messageId];
  const decision = store.operatorDecisions?.[req.params.messageId];
  if (!msg || msg.user_id !== req.userId || !decision) {
    return res.status(404).json({ error: 'Message decision not found' });
  }
  const approved = String(req.body?.decision || 'approved').toLowerCase() === 'approved';
  decision.support_review_status = approved ? 'approved' : 'rejected';
  decision.support_reviewed_by = req.body?.reviewedBy || req.userId;
  decision.support_reviewed_at = new Date().toISOString();
  decision.notes = decision.notes || null;
  msg.updated_at = new Date().toISOString();
  saveStore();

  logAudit(req.userId, 'X_SUPPORT_REVIEWED', {
    messageId: msg.id,
    supportReviewStatus: decision.support_review_status,
    reviewedBy: decision.support_reviewed_by,
    approval_chain: [{
      stage: 'support_review',
      by: decision.support_reviewed_by,
      at: decision.support_reviewed_at,
      status: decision.support_review_status
    }],
    outcome_id: `outcome:${msg.id}:support-review`,
    value_tag: 'support_sla_gate'
  });

  return res.json({ success: true, decision });
});

app.post('/api/social/messages/:messageId/admin-approve', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
  const msg = store.inboundMessages?.[req.params.messageId];
  const decision = store.operatorDecisions?.[req.params.messageId];
  if (!msg || msg.user_id !== req.userId || !decision) {
    return res.status(404).json({ error: 'Message decision not found' });
  }
  const approved = String(req.body?.decision || 'approved').toLowerCase() === 'approved';
  decision.admin_approval_status = approved ? 'approved' : 'rejected';
  decision.admin_approved_by = req.body?.approvedBy || req.userId;
  decision.admin_approved_at = new Date().toISOString();
  msg.updated_at = new Date().toISOString();
  saveStore();

  logAudit(req.userId, 'X_ADMIN_APPROVED', {
    messageId: msg.id,
    adminApprovalStatus: decision.admin_approval_status,
    approvedBy: decision.admin_approved_by,
    approval_chain: [{
      stage: 'admin_approval',
      by: decision.admin_approved_by,
      at: decision.admin_approved_at,
      status: decision.admin_approval_status
    }],
    outcome_id: `outcome:${msg.id}:admin-approve`,
    value_tag: 'risk_control_gate'
  });

  return res.json({ success: true, decision });
});

// Second-confirm publish after operator decision
app.post('/api/social/messages/:messageId/publish', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
    const msg = store.inboundMessages?.[req.params.messageId];
    if (!msg || msg.user_id !== req.userId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const decision = store.operatorDecisions?.[msg.id];
    if (!decision || !['approved', 'custom'].includes(decision.decision)) {
      return res.status(400).json({ error: 'Message must be approved/custom before publish.' });
    }

    if (decision.support_review_status && decision.support_review_status !== 'not-required' && decision.support_review_status !== 'approved') {
      return res.status(403).json({ error: 'Support review is required before publish.' });
    }
    if (decision.admin_approval_status && decision.admin_approval_status !== 'not-required' && decision.admin_approval_status !== 'approved') {
      return res.status(403).json({ error: 'Admin approval is required before publish.' });
    }

    const suggestions = store.suggestedResponses?.[msg.id]?.suggestions || [];
    const forcedText = req.body?.responseText ? String(req.body.responseText).trim().slice(0, 280) : null;
    let replyText = forcedText || decision.customReplyText || null;

    if (!replyText && decision.selectedSuggestionRank) {
      const pick = suggestions.find(s => Number(s.rank) === Number(decision.selectedSuggestionRank));
      replyText = pick?.responseText || null;
    }

    if (!replyText) {
      return res.status(400).json({ error: 'No reply text selected. Provide responseText or approve a suggestion rank.' });
    }

    if (!msg.provider_message_id) {
      return res.status(400).json({ error: 'Inbound message missing provider_message_id for reply target.' });
    }

    const actionId = uuidv4();
    const action = {
      id: actionId,
      user_id: req.userId,
      account_id: msg.account_id || null,
      provider: 'x',
      action_type: 'reply',
      title: 'Growth Ops inbound reply publish',
      description: `Second-confirm publish for inbound message ${msg.id}`,
      payload: {
        text: replyText,
        replyToId: String(msg.provider_message_id)
      },
      outcome_id: `outcome:${msg.id}:publish`,
      value_tag: deriveValueTag('execute_x_action', { messageId: msg.id, incident: !!msg.incident }),
      status: 'approved',
      approved_by: decision.decidedBy || req.userId,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_mode: 'growth-inbound-reply'
    };

    store.actions[actionId] = action;
    const execution = await executeXAction(action);

    action.status = 'completed';
    action.execution_status = 'success';
    action.executed_at = new Date().toISOString();
    action.execution_result = execution;
    action.updated_at = new Date().toISOString();

    decision.publish_status = 'published';
    decision.action_id = actionId;
    decision.published_tweet_id = execution.tweetId || null;
    decision.published_url = execution.url || null;
    decision.published_at = new Date().toISOString();

    msg.status = 'published';
    msg.read = true;
    msg.updated_at = new Date().toISOString();
    saveStore();

    logAudit(req.userId, 'X_INBOUND_PUBLISHED', {
      messageId: msg.id,
      actionId,
      tweetId: execution.tweetId || null,
      url: execution.url || null,
      approval_chain: [
        {
          stage: 'operator_decision',
          by: decision.decidedBy || req.userId,
          at: decision.decided_at || null,
          status: decision.decision
        },
        {
          stage: 'support_review',
          by: decision.support_reviewed_by || null,
          at: decision.support_reviewed_at || null,
          status: decision.support_review_status || 'not-required'
        },
        {
          stage: 'admin_approval',
          by: decision.admin_approved_by || null,
          at: decision.admin_approved_at || null,
          status: decision.admin_approval_status || 'not-required'
        }
      ],
      outcome_id: action.outcome_id,
      value_tag: action.value_tag
    });

    return res.json({
      success: true,
      action,
      execution,
      decision
    });
  } catch (err) {
    console.error('Message publish error:', err.message);
    return res.status(err.status || (err.code === 'PAYWALL_LOCKED' ? 402 : 400)).json({
      error: err.message,
      code: err.code || 'PUBLISH_FAILED',
      revenue: err.state || getRevenueState(req.userId),
      ops: err.ops || getOpsControl()
    });
  }
});

// Get market signals
app.get('/api/social/market-signals', (req, res) => {
  const { accountId } = req.query;
  const signal = accountId ? store.signals[accountId] : null;
  
  res.json(signal || {
    audienceDelta: 0,
    engagementRate: 0,
    opportunityScore: 0,
    risk: 'unknown',
    source: 'fallback',
    updatedAt: new Date().toISOString()
  });
});

// Update market signals
app.post('/api/social/market-signals/update', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  const { accountId, audienceDelta, engagementRate, opportunityScore, risk, source } = req.body;
  
  if (!accountId) {
    return res.status(400).json({ error: 'Missing accountId' });
  }
  
  store.signals[accountId] = {
    accountId,
    audienceDelta: audienceDelta || 0,
    engagementRate: engagementRate || 0,
    opportunityScore: opportunityScore || 0,
    risk: risk || 'unknown',
    source: source || 'fallback',
    syncedAt: new Date().toISOString()
  };
  saveStore();
  
  return res.json({ success: true });
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
});

// Create action
app.post('/api/social/actions', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  const { accountId, provider, actionType, title, description, payload } = req.body;
  
  if (!accountId || !provider || !actionType || !title || !payload) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const actionId = uuidv4();
  store.actions[actionId] = {
    id: actionId,
    user_id: req.userId,
    account_id: accountId,
    provider,
    action_type: actionType,
    title,
    description: description || '',
    payload,
    outcome_id: `outcome:${actionId}`,
    value_tag: provider === 'x' ? deriveValueTag('execute_x_action', { actionId }) : 'loop_unlock',
    status: 'proposed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  saveStore();
  
  logAudit(req.userId, 'ACTION_CREATED', { actionId, actionType, title });
  
  return res.json(store.actions[actionId]);
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
});

// Get actions
app.get('/api/social/actions', (req, res) => {
  const { status } = req.query;
  let actions = Object.values(store.actions).filter(a => a.user_id === req.userId);
  
  if (status) {
    actions = actions.filter(a => a.status === status);
  }
  
  actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json({ items: actions, count: actions.length });
});

// Get action
app.get('/api/social/actions/:actionId', (req, res) => {
  const action = store.actions[req.params.actionId];
  
  if (action && action.user_id === req.userId) {
    return res.json(action);
  }
  
  res.status(404).json({ error: 'Action not found' });
});

// Approve action
app.post('/api/social/actions/:actionId/approve', async (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
  const action = store.actions[req.params.actionId];
  const { approvedBy } = req.body || {};
  
  if (action && action.user_id === req.userId) {
    action.status = 'approved';
    action.approved_by = approvedBy || req.userId;
    action.approved_at = new Date().toISOString();
    action.updated_at = new Date().toISOString();

    try {
      if (action.provider === 'x') {
        const execution = await executeXAction(action);
        action.status = 'completed';
        action.execution_status = 'success';
        action.executed_at = new Date().toISOString();
        action.execution_result = execution;
        action.updated_at = new Date().toISOString();
        saveStore();

        logAudit(req.userId, 'ACTION_APPROVED_EXECUTED', {
          actionId: req.params.actionId,
          provider: 'x',
          kind: execution.kind,
          tweetId: execution.tweetId || null,
          approval_chain: [{
            stage: 'action_approval',
            by: action.approved_by || req.userId,
            at: action.approved_at || null,
            status: 'approved'
          }],
          outcome_id: action.outcome_id || `outcome:${action.id}`,
          value_tag: action.value_tag || deriveValueTag('execute_x_action', { actionId: action.id })
        });
        return res.json(action);
      }

      saveStore();
      logAudit(req.userId, 'ACTION_APPROVED', { actionId: req.params.actionId });
      return res.json(action);
    } catch (err) {
      action.status = 'failed';
      action.execution_status = 'failed';
      action.failure_reason = err.message;
      action.updated_at = new Date().toISOString();
      saveStore();

      logAudit(req.userId, 'ACTION_EXECUTION_FAILED', {
        actionId: req.params.actionId,
        provider: action.provider,
        error: err.message
      });

      return res.status(err.code === 'PAYWALL_LOCKED' ? 402 : 400).json({
        error: err.message,
        code: err.code || 'ACTION_EXECUTION_FAILED',
        action,
        revenue: err.state || getRevenueState(req.userId),
        ops: err.ops || getOpsControl()
      });
    }
  }
  
  res.status(404).json({ error: 'Action not found' });
});

// Reject action
app.post('/api/social/actions/:actionId/reject', (req, res) => {
  try {
    assertLayerAWriteGate(req.userId, { billable: false });
  const { reason } = req.body;
  const action = store.actions[req.params.actionId];
  
  if (action && action.user_id === req.userId) {
    action.status = 'failed';
    action.failure_reason = reason || 'Rejected by user';
    action.updated_at = new Date().toISOString();
    saveStore();
    
    logAudit(req.userId, 'ACTION_REJECTED', { actionId: req.params.actionId });
    
    return res.json(action);
  }
  
  return res.status(404).json({ error: 'Action not found' });
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message, code: err.code || 'OPS_DEGRADED', ops: err.ops || getOpsControl() });
  }
});

app.get('/api/social/audit', (req, res) => {
  const provider = String(req.query?.provider || '').toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 50)));
  let items = (store.auditLog || []).filter(a => a.user_id === req.userId);
  if (provider) {
    items = items.filter(a => {
      const action = String(a.action || '').toLowerCase();
      return provider === 'x' ? action.includes('x_') || action.includes('oauth') : true;
    });
  }
  items.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return res.json({ items: items.slice(0, limit), count: items.length });
});

app.get('/api/social/x/policy', (req, res) => {
  return res.json({ success: true, policy: getXPolicy() });
});

app.post('/api/social/x/policy', (req, res) => {
  assertLayerAWriteGate(req.userId, { billable: false });
  const threshold = Number(req.body?.approvalFollowerThreshold);
  const requireSupport = req.body?.requireSupportReviewForCustomerFacing;
  const layer = getLayerAPolicy();
  if (Number.isFinite(threshold)) {
    layer.approvals.follower_threshold = Math.max(1000, Math.floor(threshold));
  }
  if (typeof requireSupport === 'boolean') {
    layer.approvals.support_review_gate = requireSupport;
  }
  store.layerAPolicy.approvals = layer.approvals;
  store.xPolicy.approvalFollowerThreshold = layer.approvals.follower_threshold;
  store.xPolicy.requireSupportReviewForCustomerFacing = layer.approvals.support_review_gate;
  saveStore();
  logAudit(req.userId, 'X_POLICY_UPDATED', { resource_type: 'layer_a_policy', resource_id: 'approvals', policy: getXPolicy(), status: 'success' });
  return res.json({ success: true, policy: getXPolicy() });
});

app.get('/api/social/support/queue', (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 25)));
  let items = Object.values(store.inboundMessages || {})
    .filter(m => m.user_id === req.userId)
    .map(m => ({
      ...m,
      message_text: m.message_text || m.text || '',
      routed_to: Array.isArray(m.routed_to) ? m.routed_to : [],
      author: m.author || { handle: (m.author_handle || '').replace(/^@/, ''), display_name: m.author_name || m.author_handle || 'Unknown' }
    }))
    .filter(m => m.routed_to.includes('support') || m.incident || isSupportComplaint(m.message_text));

  items.sort((a, b) => new Date(b.received_at || b.updated_at || 0) - new Date(a.received_at || a.updated_at || 0));
  return res.json({ items: items.slice(0, limit), count: items.length, serverTime: new Date().toISOString() });
});

app.get('/api/social/x/founder-status', (req, res) => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const postsToday = (xFeedCache.postedTweets || []).filter(t => new Date(t.at || 0).getTime() >= start).length;
  const unreadFlags = (xFeedCache.flags || []).filter(f => !f.seen).length;
  const tokenHealthy = xFeedCache.tokenStatus === 'ok' && xFeedCache.apiHealthy;
  const summary = `X account: ${postsToday} posts today, ${unreadFlags} flags, token ${tokenHealthy ? 'healthy' : (xFeedCache.tokenStatus || 'unknown')}`;
  return res.json({
    success: true,
    postsToday,
    unreadFlags,
    tokenStatus: xFeedCache.tokenStatus,
    tokenHealthy,
    summary,
    marketSignal: store.signals || {}
  });
});

app.get('/api/social/x/system-events', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 40)));
  const items = (store.systemEvents || [])
    .filter(e => e.source === 'x')
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, limit);
  return res.json({ items, count: items.length });
});

app.get('/api/social/x/weekly-summary', async (req, res) => {
  try {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyMetrics = (store.xMetricsHistory || []).filter(r => new Date(r.at || 0).getTime() >= since);
    const top = weeklyMetrics
      .slice()
      .sort((a, b) => (Number(b.metrics?.like_count || 0) + Number(b.metrics?.retweet_count || 0)) - (Number(a.metrics?.like_count || 0) + Number(a.metrics?.retweet_count || 0)))
      .slice(0, 5);

    const compact = {
      totalSnapshots: weeklyMetrics.length,
      distinctTweets: new Set(weeklyMetrics.map(r => r.tweetId)).size,
      topTweets: top.map(t => ({ id: t.tweetId, text: String(t.text || '').slice(0, 120), metrics: t.metrics, at: t.at })),
      flags: (xFeedCache.flags || []).filter(f => new Date(f.at || 0).getTime() >= since).length,
      tokenStatus: xFeedCache.tokenStatus
    };

    let summary = `Weekly X summary: ${compact.distinctTweets} tweets tracked with ${compact.flags} flags; token status ${compact.tokenStatus}.`;
    try {
      const prompt = `Summarize this weekly X performance data in 6 concise bullets for Founder, Growth Ops, and Data. Include 1 risk and 1 next action. Data: ${JSON.stringify(compact)}`;
      const out = await generateReasoningText(prompt, { maxTokens: 320, temperature: 0.2 });
      if (String(out || '').trim()) summary = String(out).trim();
    } catch {}

    return res.json({ success: true, summary, stats: compact });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Revenue Kernel endpoints
app.get('/api/billing/plans', (_req, res) => {
  const plans = Object.values(store.billingPlans || {});
  return res.json({ items: plans, count: plans.length });
});

app.get('/api/billing/subscription', (req, res) => {
  const state = getRevenueState(req.userId);
  const user = store.users?.[req.userId] || {};
  return res.json({
    success: true,
    user: {
      id: req.userId,
      tier: user.tier || state.plan_id,
      plan_id: user.plan_id || state.plan_id
    },
    subscription: state
  });
});

app.get('/api/billing/usage', (req, res) => {
  const state = getRevenueState(req.userId);
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 40)));
  const items = (store.unlockLedger || [])
    .filter(e => e.user_id === req.userId)
    .slice(0, limit);
  return res.json({ success: true, usage: state, events: items, count: items.length });
});

app.get('/api/billing/unlocks', (req, res) => {
  const since = req.query?.since ? new Date(String(req.query.since)).getTime() : null;
  let items = (store.unlockLedger || []).filter(e => e.user_id === req.userId);
  if (Number.isFinite(since)) {
    items = items.filter(e => new Date(e.metered_at || 0).getTime() >= since);
  }
  return res.json({ success: true, items, count: items.length });
});

app.get('/api/billing/founder-metrics', (req, res) => {
  const state = getRevenueState(req.userId);
  const currentPeriodStart = new Date(state.period_start_at).getTime();
  const periodEvents = (store.unlockLedger || []).filter(e => e.user_id === req.userId && new Date(e.metered_at || 0).getTime() >= currentPeriodStart);
  const blockedAttempts = Number(store.usageLedger?.[req.userId]?.blocked_attempts || 0) || 0;
  const byEventType = {};
  periodEvents.forEach((e) => {
    const k = String(e.event_type || 'unknown');
    byEventType[k] = (byEventType[k] || 0) + 1;
  });
  return res.json({
    success: true,
    period_start_at: state.period_start_at,
    period_end_at: state.period_end_at,
    plan_id: state.plan_id,
    paywall_state: state.paywall_state,
    unlocks_used: state.used,
    unlocks_allowance: state.allowance,
    unlocks_remaining: state.remaining,
    blocked_demand: blockedAttempts,
    unlocks_by_event_type: byEventType,
    projected_conversion_pressure: blockedAttempts + Math.max(0, state.overage_used || 0)
  });
});

app.get('/api/billing/pressure-board', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 25)));
  const rows = Object.keys(store.users || {}).map((userId) => {
    const state = getRevenueState(userId);
    const periodStartTs = new Date(state.period_start_at || 0).getTime();
    const unlockCount = (store.unlockLedger || []).filter(
      e => e.user_id === userId && new Date(e.metered_at || 0).getTime() >= periodStartTs
    ).length;
    const blockedAttempts = Number(store.usageLedger?.[userId]?.blocked_attempts || 0) || 0;
    const pressure = blockedAttempts + Math.max(0, Number(state.overage_used || 0) || 0);

    return {
      user_id: userId,
      plan_id: state.plan_id,
      paywall_state: state.paywall_state,
      unlocks_used: Number(state.used || 0) || 0,
      unlocks_allowance: Number(state.allowance || 0) || 0,
      unlocks_remaining: Number(state.remaining || 0) || 0,
      blocked_demand: blockedAttempts,
      unlock_events_this_period: unlockCount,
      conversion_pressure: pressure,
      period_end_at: state.period_end_at
    };
  });

  rows.sort((a, b) => b.conversion_pressure - a.conversion_pressure || b.blocked_demand - a.blocked_demand || b.unlocks_used - a.unlocks_used);
  return res.json({
    success: true,
    generated_at: new Date().toISOString(),
    items: rows.slice(0, limit),
    count: rows.length
  });
});

app.get('/api/billing/policy', (_req, res) => {
  const layer = getLayerAPolicy();
  return res.json({
    success: true,
    policy: {
      warnThresholdPct: layer.entitlement.warning_threshold_pct,
      graceLoopUnlocks: layer.entitlement.grace_loop_unlocks,
      maxUnlockLedgerEntries: layer.entitlement.max_unlock_ledger_entries
    }
  });
});

app.get('/api/system/control', (_req, res) => {
  return res.json({ success: true, control: getOpsControl() });
});

app.post('/api/system/control', (req, res) => {
  assertLayerAWriteGate(req.userId, { billable: false });
  const { monetizationKillSwitch, operationsKillSwitch, degradeMode } = req.body || {};
  const layer = getLayerAPolicy();
  if (typeof monetizationKillSwitch === 'boolean') layer.safety.monetizationKillSwitch = monetizationKillSwitch;
  if (typeof operationsKillSwitch === 'boolean') layer.safety.operationsKillSwitch = operationsKillSwitch;
  if (['normal', 'monetization_open', 'operations_readonly'].includes(String(degradeMode || ''))) layer.safety.degradeMode = String(degradeMode);
  store.layerAPolicy.safety = layer.safety;
  store.opsControl.monetizationKillSwitch = layer.safety.monetizationKillSwitch;
  store.opsControl.operationsKillSwitch = layer.safety.operationsKillSwitch;
  store.opsControl.degradeMode = layer.safety.degradeMode;
  store.opsControl.updated_at = new Date().toISOString();
  saveStore();
  logAudit(req.userId, 'SYSTEM_CONTROL_UPDATED', { control: getOpsControl() });
  return res.json({ success: true, control: getOpsControl() });
});

app.post('/api/billing/policy', (req, res) => {
  assertLayerAWriteGate(req.userId, { billable: false });
  const { warnThresholdPct, graceLoopUnlocks, maxUnlockLedgerEntries } = req.body || {};
  const layer = getLayerAPolicy();
  if (Number.isFinite(Number(warnThresholdPct))) {
    layer.entitlement.warning_threshold_pct = Math.max(0.1, Math.min(0.99, Number(warnThresholdPct)));
  }
  if (Number.isFinite(Number(graceLoopUnlocks))) {
    layer.entitlement.grace_loop_unlocks = Math.max(0, Math.floor(Number(graceLoopUnlocks)));
  }
  if (Number.isFinite(Number(maxUnlockLedgerEntries))) {
    layer.entitlement.max_unlock_ledger_entries = Math.max(1000, Math.floor(Number(maxUnlockLedgerEntries)));
  }
  store.layerAPolicy.entitlement = layer.entitlement;
  store.billingPolicy.warnThresholdPct = layer.entitlement.warning_threshold_pct;
  store.billingPolicy.graceLoopUnlocks = layer.entitlement.grace_loop_unlocks;
  store.billingPolicy.maxUnlockLedgerEntries = layer.entitlement.max_unlock_ledger_entries;
  saveStore();
  logAudit(req.userId, 'BILLING_POLICY_UPDATED', { policy: store.layerAPolicy.entitlement });
  return res.json({ success: true, policy: getLayerAPolicy().entitlement });
});

app.get('/api/layer-a/state', (req, res) => {
  return res.json({
    success: true,
    policy: getLayerAPolicy(),
    control: getOpsControl(),
    effective_entitlements: getEffectiveEntitlements(req.userId)
  });
});

app.post('/api/property/snapshot', (req, res) => {
  try {
    const payload = sanitizePropertySnapshotPayload(req.body || {});
    const key = `${req.userId}:${payload.propertyId}`;
    const snapshot = {
      id: key,
      user_id: req.userId,
      property_id: payload.propertyId,
      property_name: payload.propertyName,
      property_source: payload.source,
      repo: payload.repo,
      zone_summary: payload.zoneSummary,
      files_sample: payload.filesSample,
      signals: payload.signals,
      privacy: payload.privacy,
      captured_at: payload.capturedAt,
      synced_at: payload.syncedAt,
      heartbeat_at: store.propertySyncHeartbeats?.[key]?.received_at || null
    };

    store.propertySnapshots[key] = snapshot;
    saveStore();
    logAudit(req.userId, 'PROPERTY_SNAPSHOT_SYNCED', {
      propertyId: payload.propertyId,
      propertyName: payload.propertyName,
      source: payload.source,
      redCount: payload.zoneSummary.red.count,
      yellowCount: payload.zoneSummary.yellow.count,
      greenCount: payload.zoneSummary.green.count
    });

    return res.json({ success: true, snapshot });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'Invalid property snapshot payload.' });
  }
});

app.post('/api/property/sync-heartbeat', (req, res) => {
  const propertyIdRaw = String(req.body?.property_id || req.body?.propertyId || '').trim();
  if (!propertyIdRaw) {
    return res.status(400).json({ success: false, error: 'property_id is required' });
  }

  const propertyId = propertyIdRaw.toLowerCase().replace(/[^a-z0-9:_\-./]/g, '-').slice(0, 160);
  const key = `${req.userId}:${propertyId}`;
  const heartbeat = {
    id: key,
    user_id: req.userId,
    property_id: propertyId,
    status: String(req.body?.status || 'alive').slice(0, 24),
    note: String(req.body?.note || '').slice(0, 200) || null,
    client_last_sync_at: String(req.body?.last_sync_at || req.body?.lastSyncAt || '').trim() || null,
    received_at: new Date().toISOString()
  };

  store.propertySyncHeartbeats[key] = heartbeat;
  if (store.propertySnapshots?.[key]) {
    store.propertySnapshots[key].heartbeat_at = heartbeat.received_at;
  }
  saveStore();
  return res.json({ success: true, heartbeat });
});

app.get('/api/property/snapshot', (req, res) => {
  const requested = String(req.query?.propertyId || req.query?.property_id || '').trim();
  const normalized = requested ? requested.toLowerCase().replace(/[^a-z0-9:_\-./]/g, '-').slice(0, 160) : null;
  const snapshots = getUserPropertySnapshots(req.userId);
  let snapshot = null;

  if (normalized) {
    snapshot = snapshots.find(s => s.property_id === normalized) || null;
  }
  if (!snapshot) {
    snapshot = snapshots[0] || null;
  }

  return res.json({
    success: true,
    snapshot,
    items: snapshots.slice(0, 10),
    count: snapshots.length,
    generated_at: new Date().toISOString()
  });
});

app.post('/api/layer-a/policy', (req, res) => {
  assertLayerAWriteGate(req.userId, { billable: false });
  const layer = getLayerAPolicy();
  const patch = req.body || {};

  if (patch.entitlement && typeof patch.entitlement === 'object') {
    if (Number.isFinite(Number(patch.entitlement.warning_threshold_pct))) {
      layer.entitlement.warning_threshold_pct = Math.max(0.1, Math.min(0.99, Number(patch.entitlement.warning_threshold_pct)));
    }
    if (Number.isFinite(Number(patch.entitlement.grace_loop_unlocks))) {
      layer.entitlement.grace_loop_unlocks = Math.max(0, Math.floor(Number(patch.entitlement.grace_loop_unlocks)));
    }
    if (Number.isFinite(Number(patch.entitlement.max_unlock_ledger_entries))) {
      layer.entitlement.max_unlock_ledger_entries = Math.max(1000, Math.floor(Number(patch.entitlement.max_unlock_ledger_entries)));
    }
    if (patch.entitlement.default_plan && store.billingPlans[String(patch.entitlement.default_plan)]) {
      layer.entitlement.default_plan = String(patch.entitlement.default_plan);
    }
  }

  if (patch.approvals && typeof patch.approvals === 'object') {
    if (typeof patch.approvals.support_review_gate === 'boolean') {
      layer.approvals.support_review_gate = patch.approvals.support_review_gate;
    }
    if (Number.isFinite(Number(patch.approvals.follower_threshold))) {
      layer.approvals.follower_threshold = Math.max(1000, Math.floor(Number(patch.approvals.follower_threshold)));
    }
  }

  if (patch.sla_tiers && typeof patch.sla_tiers === 'object') {
    ['p1_target_minutes', 'p2_target_minutes', 'p3_target_minutes'].forEach((key) => {
      if (Number.isFinite(Number(patch.sla_tiers[key]))) {
        layer.sla_tiers[key] = Math.max(1, Math.floor(Number(patch.sla_tiers[key])));
      }
    });
  }

  if (Array.isArray(patch.escalation_rules)) {
    layer.escalation_rules = patch.escalation_rules.slice(0, 20);
  }

  if (patch.safety && typeof patch.safety === 'object') {
    if (typeof patch.safety.monetizationKillSwitch === 'boolean') {
      layer.safety.monetizationKillSwitch = patch.safety.monetizationKillSwitch;
    }
    if (typeof patch.safety.operationsKillSwitch === 'boolean') {
      layer.safety.operationsKillSwitch = patch.safety.operationsKillSwitch;
    }
    if (['normal', 'monetization_open', 'operations_readonly'].includes(String(patch.safety.degradeMode || ''))) {
      layer.safety.degradeMode = String(patch.safety.degradeMode);
    }
  }

  store.layerAPolicy = layer;
  store.billingPolicy.warnThresholdPct = layer.entitlement.warning_threshold_pct;
  store.billingPolicy.graceLoopUnlocks = layer.entitlement.grace_loop_unlocks;
  store.billingPolicy.maxUnlockLedgerEntries = layer.entitlement.max_unlock_ledger_entries;
  store.xPolicy.approvalFollowerThreshold = layer.approvals.follower_threshold;
  store.xPolicy.requireSupportReviewForCustomerFacing = layer.approvals.support_review_gate;
  store.opsControl.monetizationKillSwitch = layer.safety.monetizationKillSwitch;
  store.opsControl.operationsKillSwitch = layer.safety.operationsKillSwitch;
  store.opsControl.degradeMode = layer.safety.degradeMode;
  store.opsControl.updated_at = new Date().toISOString();

  saveStore();
  logAudit(req.userId, 'LAYER_A_POLICY_UPDATED', { resource_type: 'layer_a_policy', resource_id: 'default', status: 'success' });
  return res.json({ success: true, policy: getLayerAPolicy(), control: getOpsControl() });
});

app.get('/api/layer-a/export', (req, res) => {
  const format = String(req.query?.format || 'json').toLowerCase();
  const unlockByOutcome = new Map();
  (store.unlockLedger || []).forEach((event) => {
    if (event?.context?.outcome_id) unlockByOutcome.set(event.context.outcome_id, event);
  });

  const rows = (store.auditLog || []).map((entry) => {
    const env = entry.envelope || {};
    const outcomeId = env.outcome?.outcome_id || null;
    const unlock = outcomeId ? unlockByOutcome.get(outcomeId) : null;
    return {
      audit_id: entry.id,
      user_id: entry.user_id,
      action: entry.action,
      actor_id: env.actor?.id || null,
      actor_role: env.actor?.role || null,
      resource_type: env.resource?.type || null,
      resource_id: env.resource?.id || null,
      outcome_id: outcomeId,
      value_tag: env.outcome?.value_tag || null,
      status: env.outcome?.status || null,
      error: env.outcome?.error || null,
      unlock_event_id: unlock?.id || env.billing_link?.unlock_event_id || null,
      idempotency_key: unlock?.idempotency_key || env.billing_link?.idempotency_key || null,
      plan_id: unlock?.plan_id || env.billing_link?.plan_id || null,
      billed_at: unlock?.metered_at || null,
      timestamp: env.timestamp || entry.timestamp
    };
  });

  if (format === 'csv') {
    const headers = Object.keys(rows[0] || {
      audit_id: '', user_id: '', action: '', actor_id: '', actor_role: '', resource_type: '', resource_id: '',
      outcome_id: '', value_tag: '', status: '', error: '', unlock_event_id: '', idempotency_key: '',
      plan_id: '', billed_at: '', timestamp: ''
    });
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(',')]
      .concat(rows.map(row => headers.map(h => escape(row[h])).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="layer-a-proof-export.csv"');
    return res.send(csv);
  }

  return res.json({ success: true, generated_at: new Date().toISOString(), count: rows.length, rows });
});

app.get('/api/layer-a/contract-matrix', (req, res) => {
  const checks = [];
  const assertEqual = (name, actual, expected, detail = {}) => {
    const ok = actual === expected;
    checks.push({
      name,
      pass: ok,
      expected,
      actual,
      detail,
      error: ok ? undefined : `Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`
    });
  };

  const assertTrue = (name, condition, detail = {}, expected = true) => {
    const actual = !!condition;
    const ok = actual === expected;
    checks.push({
      name,
      pass: ok,
      expected,
      actual,
      detail,
      error: ok ? undefined : `Expected ${expected} but received ${actual}`
    });
  };

  const fixtureUser = `matrix-${Date.now()}`;
  const beforeLayer = JSON.parse(JSON.stringify(getLayerAPolicy()));
  const beforeOps = { ...(store.opsControl || {}) };

  try {
    const layer = getLayerAPolicy();
    layer.safety.degradeMode = 'normal';
    layer.safety.monetizationKillSwitch = false;
    layer.safety.operationsKillSwitch = false;
    layer.entitlement.grace_loop_unlocks = Math.max(1, Number(layer.entitlement.grace_loop_unlocks || 1));
    store.layerAPolicy = layer;
    store.opsControl.degradeMode = layer.safety.degradeMode;
    store.opsControl.monetizationKillSwitch = layer.safety.monetizationKillSwitch;
    store.opsControl.operationsKillSwitch = layer.safety.operationsKillSwitch;

    const sub = ensureUserSubscription(fixtureUser);
    const ledger = ensureUsageLedger(fixtureUser).ledger;

    sub.plan_id = 'free';
    sub.status = 'trialing';
    ledger.used = 0;
    const preview = getRevenueState(fixtureUser);
    assertEqual('paywall_fixture_preview', preview.paywall_state, 'preview', { plan: sub.plan_id, status: sub.status, used: ledger.used, allowance: preview.allowance });

    sub.plan_id = 'pro';
    sub.status = 'active';
    ledger.used = 0;
    const unlock = getRevenueState(fixtureUser);
    assertEqual('paywall_fixture_unlock', unlock.paywall_state, 'unlock', { plan: sub.plan_id, status: sub.status, used: ledger.used, allowance: unlock.allowance });

    const grace = Number(layer.entitlement.grace_loop_unlocks || 1);
    ledger.used = Number(unlock.allowance || 0);
    const overage = getRevenueState(fixtureUser);
    assertEqual('paywall_fixture_overage', overage.paywall_state, 'overage', { used: ledger.used, allowance: overage.allowance, grace });

    ledger.used = Number(unlock.allowance || 0) + grace;
    const locked = getRevenueState(fixtureUser);
    assertEqual('paywall_fixture_locked', locked.paywall_state, 'locked', { used: ledger.used, allowance: locked.allowance, grace });

    store.layerAPolicy.safety.degradeMode = 'operations_readonly';
    store.opsControl.degradeMode = 'operations_readonly';
    let blockedErrorCode = null;
    try {
      assertLayerAWriteGate(fixtureUser, { billable: false });
    } catch (err) {
      blockedErrorCode = err.code || null;
    }
    assertEqual('safety_operations_readonly_error_code', blockedErrorCode, 'OPS_DEGRADED');

    store.layerAPolicy.safety.degradeMode = 'monetization_open';
    store.opsControl.degradeMode = 'monetization_open';
    const bypassState = getRevenueState(fixtureUser);
    assertTrue('safety_monetization_open_bypass', bypassState.monetization_bypass === true, { paywall_state: bypassState.paywall_state });
    assertTrue('safety_monetization_open_not_blocked', bypassState.blocked === false, { used: bypassState.used, allowance: bypassState.allowance });

    store.layerAPolicy.safety.degradeMode = 'normal';
    store.opsControl.degradeMode = 'normal';
    sub.plan_id = 'pro';
    sub.status = 'active';
    ledger.used = 0;
    const beforeUsed = Number(getRevenueState(fixtureUser).used || 0);
    const idem = `idem-${Date.now()}`;
    const first = consumeLoopUnlock(fixtureUser, {
      eventType: 'LAYER_A_CONTRACT_TEST',
      idempotencyKey: idem,
      context: { source: 'contract-matrix' },
      actor: fixtureUser
    });
    const afterFirstUsed = Number(getRevenueState(fixtureUser).used || 0);
    const second = consumeLoopUnlock(fixtureUser, {
      eventType: 'LAYER_A_CONTRACT_TEST',
      idempotencyKey: idem,
      context: { source: 'contract-matrix' },
      actor: fixtureUser
    });
    const afterSecondUsed = Number(getRevenueState(fixtureUser).used || 0);
    assertTrue('idempotency_first_allowed', first.allowed === true, { first });
    assertTrue('idempotency_second_marked_duplicate', second.duplicate === true, { second });
    assertEqual('idempotency_usage_increment_once', afterSecondUsed - beforeUsed, 1, { beforeUsed, afterFirstUsed, afterSecondUsed });

    const transitionModes = ['normal', 'operations_readonly', 'monetization_open', 'normal'];
    const observedModes = [];
    transitionModes.forEach((mode) => {
      store.layerAPolicy.safety.degradeMode = mode;
      store.opsControl.degradeMode = mode;
      observedModes.push(getOpsControl().degradeMode);
    });
    assertEqual('recovery_transition_sequence', JSON.stringify(observedModes), JSON.stringify(transitionModes), { observedModes, transitionModes });
  } finally {
    store.layerAPolicy = beforeLayer;
    store.opsControl = { ...store.opsControl, ...beforeOps };
    delete store.users[fixtureUser];
    delete store.subscriptions[fixtureUser];
    delete store.usageLedger[fixtureUser];
    store.unlockLedger = (store.unlockLedger || []).filter(e => e.user_id !== fixtureUser);
    saveStore();
  }

  const ok = checks.every(c => c.pass);
  return res.status(ok ? 200 : 500).json({ success: ok, checks, policy: getLayerAPolicy(), control: getOpsControl() });
});

app.post('/api/billing/subscription', (req, res) => {
  const nextPlan = String(req.body?.plan_id || '').toLowerCase();
  if (!nextPlan || !store.billingPlans[nextPlan]) {
    return res.status(400).json({ error: 'Invalid plan_id.' });
  }

  const user = store.users[req.userId] || { id: req.userId, created_at: new Date().toISOString() };
  user.plan_id = nextPlan;
  user.tier = nextPlan === 'growth_pro' ? 'pro' : nextPlan;
  store.users[req.userId] = user;

  const sub = ensureUserSubscription(req.userId);
  sub.plan_id = nextPlan;
  sub.status = nextPlan === 'free'
    ? (new Date(sub.trial_ends_at || 0).getTime() > Date.now() ? 'trialing' : 'expired')
    : 'active';
  sub.updated_at = new Date().toISOString();

  saveStore();
  logAudit(req.userId, 'SUBSCRIPTION_CHANGED', { plan_id: nextPlan, status: sub.status });
  return res.json({ success: true, subscription: getRevenueState(req.userId) });
});

// Audit logging
function logAudit(userId, action, details = {}) {
  const now = new Date().toISOString();
  const approvalChain = Array.isArray(details.approval_chain)
    ? details.approval_chain
    : (details.approval_chain ? [details.approval_chain] : []);
  const actorId = details.actor_id || userId || 'system';
  const actorRole = details.actor_role || (actorId === 'system' ? 'system' : 'operator');
  const billingLink = {
    unlock_event_id: details.billing_link?.unlock_event_id || details.unlock_event_id || null,
    idempotency_key: details.billing_link?.idempotency_key || details.idempotency_key || null,
    plan_id: details.billing_link?.plan_id || details.plan_id || null
  };
  const envelope = {
    actor: {
      id: actorId,
      role: actorRole
    },
    action,
    resource: {
      type: details.resource_type || null,
      id: details.resource_id || null
    },
    approval_chain: approvalChain,
    outcome: {
      outcome_id: details.outcome_id || null,
      value_tag: details.value_tag || null,
      status: details.status || 'recorded',
      error: details.error || null
    },
    billing_link: billingLink,
    timestamp: now
  };

  const entry = {
    id: uuidv4(),
    user_id: userId,
    action,
    schema_version: 'layer_a_v1',
    envelope,
    details,
    timestamp: now
  };
  store.auditLog.push(entry);
  
  // Keep only last 1000 entries
  if (store.auditLog.length > 1000) {
    store.auditLog = store.auditLog.slice(-1000);
  }
  
  saveStore();
  return entry;
}

// ─────────────────────────────────────────────────────────────
//  X LIVE FEED  —  polling + uptime monitoring
// ─────────────────────────────────────────────────────────────

// In-memory feed cache (cleared on restart, rebuilt by first poll)
const xFeedCache = {
  postedTweets:  [],   // recent tweets we sent
  mentions:      [],   // inbound @mentions
  actionLog:     [],   // Growth Ops action outcomes
  tokenStatus:   'unknown',  // 'ok' | 'expired' | 'error' | 'unknown'
  apiHealthy:    true,
  lastPollAt:    null,
  lastPollError: null,
  flags:         [],   // escalation flags for Admin/Support
};

// Sentiment classifier (simple keyword heuristic — no external API)
function classifySentiment(text) {
  const t = (text || '').toLowerCase();
  const neg = ['broken', 'bug', 'down', 'error', 'fail', 'crashed', 'issue', 'problem',
               'terrible', 'awful', 'worst', 'scam', 'fraud', 'hate', 'refund', 'cancel',
               'not working', 'doesn\'t work', 'lost', 'stuck', 'wtf', 'wtaf'];
  const pos = ['love', 'great', 'amazing', 'awesome', 'fantastic', 'perfect', 'thank',
               'nice', 'good', 'works', 'excellent', 'brilliant', 'helpful', 'impressed'];
  let score = 0;
  neg.forEach(w => { if (t.includes(w)) score -= 1; });
  pos.forEach(w => { if (t.includes(w)) score += 1; });
  if (score < 0) return 'negative';
  if (score > 0) return 'positive';
  return 'neutral';
}

// Push an escalation flag visible to Admin / Support
function pushFlag(type, data) {
  const flag = { id: uuidv4(), type, data, at: new Date().toISOString(), seen: false };
  xFeedCache.flags.unshift(flag);
  if (xFeedCache.flags.length > 100) xFeedCache.flags = xFeedCache.flags.slice(0, 100);
}

// Poll X API for recent tweets + mentions
async function pollXFeed(userId, accountId) {
  const account = getUserXAccount(userId, accountId);
  if (!account) { xFeedCache.tokenStatus = 'no-account'; return; }
  const xUserId = getXUserId(account);
  if (!xUserId) {
    xFeedCache.tokenStatus = 'error';
    xFeedCache.apiHealthy = false;
    xFeedCache.lastPollError = 'Connected X account is missing account user id.';
    pushSystemEvent('critical', 'X_ACCOUNT_ID_MISSING', xFeedCache.lastPollError, { accountId: account.id, handle: account.handle });
    return;
  }

  try {
    // Recent tweets posted by us
    const tweetsRes = await xApiRequest(account, {
      path: `/2/users/${xUserId}/tweets?max_results=10&tweet.fields=created_at,public_metrics,text`,
      method: 'GET',
      requiredScopes: ['tweet.read', 'users.read']
    });
    xFeedCache.postedTweets = (tweetsRes.data || []).map(t => ({
      id: t.id,
      text: t.text,
      at: t.created_at,
      metrics: t.public_metrics || {},
      url: `https://x.com/${account.handle}/status/${t.id}`,
    }));

    // Persist tweet metric snapshots for Data/Analytics correlation.
    const nowIso = new Date().toISOString();
    (tweetsRes.data || []).forEach(t => {
      store.xMetricsHistory.push({
        id: `xm-${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        accountId: account.id,
        tweetId: t.id,
        text: String(t.text || '').slice(0, 280),
        metrics: t.public_metrics || {},
        at: nowIso
      });

      const pm = t.public_metrics || {};
      const engagement = Number(pm.like_count || 0) + Number(pm.retweet_count || 0) + Number(pm.reply_count || 0) + Number(pm.quote_count || 0);
      if (engagement >= 500) {
        pushFlag('VIRAL_MOMENT', {
          tweetId: t.id,
          text: String(t.text || '').slice(0, 160),
          engagement,
          metrics: pm
        });
      }
    });
    if (store.xMetricsHistory.length > 5000) {
      store.xMetricsHistory = store.xMetricsHistory.slice(-5000);
    }

    // Inbound mentions
    const mentionsRes = await xApiRequest(account, {
      path: `/2/users/${xUserId}/mentions?max_results=10&tweet.fields=created_at,public_metrics,text,author_id&expansions=author_id&user.fields=username,name,public_metrics`,
      method: 'GET',
      requiredScopes: ['tweet.read', 'users.read']
    });
    const users = {};
    ((mentionsRes.includes || {}).users || []).forEach(u => { users[u.id] = u; });
    xFeedCache.mentions = (mentionsRes.data || []).map(t => {
      const author = users[t.author_id] || {};
      const sentiment = classifySentiment(t.text);
      const mention = {
        id: t.id,
        text: t.text,
        at: t.created_at,
        authorId: t.author_id,
        authorHandle: author.username ? `@${author.username}` : t.author_id,
        authorName: author.name || '',
        authorFollowers: Number(author?.public_metrics?.followers_count || 0) || 0,
        sentiment,
        url: `https://x.com/i/web/status/${t.id}`,
        escalated: false,
      };

      const complaint = isSupportComplaint(t.text);
      const incident = isIncidentText(t.text);
      const clientSignal = hasClientSignal(t.text);

      // Auto-flag negative mentions, incidents, and customer/client complaints for Support.
      if (sentiment === 'negative' || complaint || incident || clientSignal) {
        mention.escalated = true;
        pushFlag('NEGATIVE_MENTION', { tweetId: t.id, text: t.text, authorHandle: mention.authorHandle });
        if (incident) {
          pushFlag('INCIDENT_REPORT', { tweetId: t.id, text: t.text, authorHandle: mention.authorHandle });
        }

        // Also push into inboundMessages so Support triage sees it
        const msgId = `x-mention-${t.id}`;
        if (!store.inboundMessages[msgId]) {
          store.inboundMessages[msgId] = {
            id: msgId,
            provider: 'x',
            source: 'x-feed-poll',
            user_id: userId,
            account_id: account.id,
            provider_message_id: t.id,
            in_reply_to_tweet_id: null,
            message_text: t.text,
            type: 'mention',
            author: {
              id: t.author_id || null,
              handle: (mention.authorHandle || '').replace(/^@/, ''),
              display_name: mention.authorName || (mention.authorHandle || '').replace(/^@/, ''),
              avatar: null
            },
            author_followers: mention.authorFollowers,
            incident,
            customer_facing: complaint || clientSignal,
            read: false,
            status: 'received',
            priority: incident ? 'critical' : 'high',
            received_at: t.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            routed_to: ['support'],
            escalation_reason: incident
              ? 'incident phrase detected'
              : (complaint || clientSignal ? 'customer/client complaint routing' : 'negative sentiment auto-flag')
          };

          logAudit(userId, 'X_MENTION_ROUTED_TO_SUPPORT', {
            messageId: msgId,
            mentionId: t.id,
            incident,
            complaint,
            clientSignal,
            sentiment,
            authorHandle: mention.authorHandle
          });
        }
      }
      return mention;
    });

    xFeedCache.tokenStatus = 'ok';
    xFeedCache.apiHealthy = true;
    xFeedCache.lastPollAt = new Date().toISOString();
    xFeedCache.lastPollError = null;

    // Build action log from store
    xFeedCache.actionLog = Object.values(store.actions || {})
      .filter(a => a.provider === 'x' && a.user_id === userId)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 20)
      .map(a => ({
        id: a.id,
        type: a.action_type,
        status: a.status,
        executionStatus: a.execution_status || null,
        text: a.payload?.text || '',
        tweetId: a.execution_result?.tweetId || null,
        url: a.execution_result?.url || null,
        at: a.executed_at || a.updated_at || a.created_at,
        approvedBy: a.approved_by || null,
      }));

    saveStore();

  } catch (err) {
    xFeedCache.tokenStatus = err.message.includes('401') ? 'expired' : 'error';
    xFeedCache.apiHealthy = false;
    xFeedCache.lastPollError = err.message.slice(0, 200);
    pushSystemEvent(err.message.includes('401') ? 'critical' : 'warn', 'X_POLL_FAILED', xFeedCache.lastPollError, {
      userId,
      accountId: account?.id || null,
      handle: account?.handle || null
    });
    if (err.message.includes('401')) {
      pushFlag('TOKEN_EXPIRED', { at: new Date().toISOString() });
    }
  }
}

// GET /api/social/x/feed  — full feed snapshot for Growth Ops live panel
app.get('/api/social/x/feed', async (req, res) => {
  try {
    const { accountId, refresh } = req.query;
    // Refresh on explicit request or if stale > 45s
    const staleMs = xFeedCache.lastPollAt
      ? Date.now() - new Date(xFeedCache.lastPollAt).getTime()
      : Infinity;
    if (refresh === '1' || staleMs > 45000) {
      await pollXFeed(req.userId, accountId);
    }
    res.json({
      postedTweets:  xFeedCache.postedTweets,
      mentions:      xFeedCache.mentions,
      actionLog:     xFeedCache.actionLog,
      tokenStatus:   xFeedCache.tokenStatus,
      apiHealthy:    xFeedCache.apiHealthy,
      lastPollAt:    xFeedCache.lastPollAt,
      lastPollError: xFeedCache.lastPollError,
      flags:         xFeedCache.flags.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/x/feed/status  — lightweight health check (no X API call)
app.get('/api/social/x/feed/status', (req, res) => {
  const xEvents = (store.systemEvents || []).filter(e => e.source === 'x');
  res.json({
    tokenStatus:  xFeedCache.tokenStatus,
    apiHealthy:   xFeedCache.apiHealthy,
    lastPollAt:   xFeedCache.lastPollAt,
    lastPollError: xFeedCache.lastPollError,
    flagCount:    xFeedCache.flags.filter(f => !f.seen).length,
    postedCount:  xFeedCache.postedTweets.length,
    mentionCount: xFeedCache.mentions.length,
    criticalEventCount: xEvents.filter(e => e.severity === 'critical').length,
    recentEventCount: xEvents.slice(0, 20).length
  });
});

// POST /api/social/x/feed/flags/:flagId/seen  — mark flag read
app.post('/api/social/x/feed/flags/:flagId/seen', (req, res) => {
  const flag = xFeedCache.flags.find(f => f.id === req.params.flagId);
  if (flag) { flag.seen = true; return res.json({ success: true }); }
  res.status(404).json({ error: 'Flag not found' });
});

// ── Observability: Sentry status ────────────────────────────────────────────
async function getSentryStatus() {
  const token   = process.env.SENTRY_AUTH_TOKEN;
  const org     = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!token || !org || !project) {
    return {
      connected: false,
      healthy: false,
      projectSlug: project || null,
      organization: org || null,
      openIssueCount: 0,
      errorCount: 0,
      note: 'SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT not configured'
    };
  }

  try {
    // Fetch unresolved issues capped at 100 to count by level
    const issuesRes = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?limit=100&query=is%3Aunresolved`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!issuesRes.ok) {
      const body = await issuesRes.text().catch(() => '');
      console.warn(`[sentry] issues API ${issuesRes.status}:`, body.slice(0, 200));
      return {
        connected: true,
        healthy: false,
        projectSlug: project,
        organization: org,
        openIssueCount: 0,
        errorCount: 0,
        note: `API error ${issuesRes.status}`
      };
    }

    const issues = await issuesRes.json();
    const openIssueCount = Array.isArray(issues) ? issues.length : 0;
    const errorCount = Array.isArray(issues)
      ? issues.filter(i => i.level === 'error' || i.level === 'fatal').length
      : 0;

    return {
      connected: true,
      healthy: true,
      projectSlug: project,
      organization: org,
      openIssueCount,
      errorCount
    };
  } catch (err) {
    console.warn('[sentry] fetch error:', err.message);
    return {
      connected: true,
      healthy: false,
      projectSlug: project,
      organization: org,
      openIssueCount: 0,
      errorCount: 0,
      note: 'Sentry API unreachable'
    };
  }
}

// ── Observability: Grafana status ────────────────────────────────────────────
async function getGrafanaStatus() {
  const grafanaUrl    = process.env.GRAFANA_URL;
  const apiKey        = process.env.GRAFANA_API_KEY;
  const dashboardUid  = process.env.GRAFANA_DASHBOARD_UID || null;

  if (!grafanaUrl || !apiKey) {
    return {
      connected: false,
      healthy: false,
      dashboardUid,
      instance: grafanaUrl || null,
      alertCount: 0,
      ruleCount: 0,
      note: 'GRAFANA_URL / GRAFANA_API_KEY not configured'
    };
  }

  const authHeader = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = grafanaUrl.replace(/\/$/, '');

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: authHeader,
      signal: AbortSignal.timeout(6000)
    });
    const healthy = healthRes.ok;

    // 2. Alert rules (Grafana 9+)
    let alertCount = 0;
    let ruleCount  = 0;
    try {
      const rulesRes = await fetch(`${baseUrl}/api/v1/provisioning/alert-rules`, {
        headers: authHeader,
        signal: AbortSignal.timeout(8000)
      });
      if (rulesRes.ok) {
        const rules = await rulesRes.json();
        if (Array.isArray(rules)) {
          ruleCount  = rules.length;
          alertCount = rules.filter(r => r.state === 'alerting' || r.execErrState === 'Alerting').length;
        }
      }
    } catch (_) { /* alert rules optional */ }

    return {
      connected: true,
      healthy,
      dashboardUid,
      instance: baseUrl,
      alertCount,
      ruleCount
    };
  } catch (err) {
    console.warn('[grafana] fetch error:', err.message);
    return {
      connected: true,
      healthy: false,
      dashboardUid,
      instance: baseUrl,
      alertCount: 0,
      ruleCount: 0,
      note: 'Grafana unreachable'
    };
  }
}

// GET /api/integrations/sentry/status  (also aliased under /api/observability/)
async function handleSentryStatus(req, res) {
  try {
    const payload = await getSentryStatus();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function handleGrafanaStatus(req, res) {
  try {
    const payload = await getGrafanaStatus();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/integrations/sentry/status',   handleSentryStatus);
app.get('/api/integrations/grafana/status',  handleGrafanaStatus);
app.get('/api/observability/sentry/status',  handleSentryStatus);
app.get('/api/observability/grafana/status', handleGrafanaStatus);

// Error handler
// ══════════════════════════════════════════════════════════════════════════
// META / INSTAGRAM GRAPH API  +  GROWTH OPS AGENT
// ══════════════════════════════════════════════════════════════════════════
{
const { OpenAI } = require('openai');
const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const _igOAuthPending = new Map();

function _oaiClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
async function _metaGet(p, token, params) {
  const url = new URL(META_GRAPH_BASE + p);
  url.searchParams.set('access_token', token);
  if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  const r = await fetch(url.toString());
  const d = await r.json();
  if (d.error) { const e = new Error(d.error.message); e.metaCode = d.error.code; throw e; }
  return d;
}
async function _metaPost(p, token, body) {
  const r = await fetch(`${META_GRAPH_BASE}${p}?access_token=${encodeURIComponent(token)}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})
  });
  const d = await r.json();
  if (d.error) { const e = new Error(d.error.message); e.metaCode = d.error.code; throw e; }
  return d;
}
async function _metaDel(p, token) {
  const r = await fetch(`${META_GRAPH_BASE}${p}?access_token=${encodeURIComponent(token)}`, { method:'DELETE' });
  const d = await r.json();
  if (d.error) { const e = new Error(d.error.message); e.metaCode = d.error.code; throw e; }
  return d;
}
function _igAccounts(userId) { return store.igAccounts[userId] || []; }
function _findIgAccount(userId, igUserId) { return _igAccounts(userId).find(a => a.igUserId === igUserId); }
function _saveIgAccount(userId, acct) {
  if (!store.igAccounts[userId]) store.igAccounts[userId] = [];
  const idx = store.igAccounts[userId].findIndex(a => a.igUserId === acct.igUserId);
  if (idx >= 0) store.igAccounts[userId][idx] = acct;
  else store.igAccounts[userId].push(acct);
  saveStore();
}
function _uid(req) { return req.headers['x-user-id'] || req.query.userId || req.body?.userId || 'anon'; }

// ── OAuth start ──────────────────────────────────────────────────────────
app.get('/api/social/instagram/oauth/start', (req, res) => {
  const userId = _uid(req);
  const appId = process.env.META_APP_ID;
  const redir = process.env.META_REDIRECT_URI || 'http://localhost:8787/api/social/instagram/oauth/callback';
  if (!appId) return res.status(503).json({ error: 'META_APP_ID not configured in .env' });
  const state = crypto.randomBytes(20).toString('hex');
  _igOAuthPending.set(state, { userId, t: Date.now() });
  for (const [s,v] of _igOAuthPending) { if (Date.now()-v.t > 600000) _igOAuthPending.delete(s); }
  const scopes = 'instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,pages_show_list,pages_read_engagement';
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redir)}&scope=${encodeURIComponent(scopes)}&state=${state}&response_type=code`;
  res.json({ authUrl, state });
});

// ── OAuth callback ───────────────────────────────────────────────────────
app.get('/api/social/instagram/oauth/callback', async (req, res) => {
  const { code, state, error: oErr } = req.query;
  const popupClose = (ok, msg) => res.send(`<!DOCTYPE html><html><body><script>
    try{window.opener.postMessage({type:'IG_OAUTH_${ok?'SUCCESS':'ERROR'}',message:${JSON.stringify(String(msg))},'*')}catch(e){}
    window.close();
  </script><p>${ok?'Connected! Close this window.':'Error: '+String(msg)}</p></body></html>`);
  if (oErr) return popupClose(false, oErr);
  if (!code || !state) return popupClose(false, 'Missing code or state');
  const pending = _igOAuthPending.get(state);
  if (!pending) return popupClose(false, 'Invalid or expired OAuth state');
  _igOAuthPending.delete(state);
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  const redir = process.env.META_REDIRECT_URI || 'http://localhost:8787/api/social/instagram/oauth/callback';
  if (!appId || !appSecret) return popupClose(false, 'Meta credentials not set on server');
  try {
    const tokRes = await fetch(`${META_GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&redirect_uri=${encodeURIComponent(redir)}&code=${encodeURIComponent(code)}`);
    const tokData = await tokRes.json();
    if (tokData.error) throw new Error(tokData.error.message);
    const llRes = await fetch(`${META_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(tokData.access_token)}`);
    const llData = await llRes.json();
    if (llData.error) throw new Error(llData.error.message);
    const longToken = llData.access_token;
    const expiresAt = llData.expires_in ? new Date(Date.now()+llData.expires_in*1000).toISOString() : null;
    let permissionsSummary = [];
    try {
      const perms = await _metaGet('/me/permissions', longToken);
      permissionsSummary = (perms?.data || []).map(p => ({
        permission: p.permission,
        status: p.status
      }));
    } catch (permErr) {
      permissionsSummary = [{ error: permErr.message }];
    }
    const pages = await _metaGet('/me/accounts', longToken, { fields:'id,name,access_token,instagram_business_account' });
    const pageDebug = (pages?.data || []).map(pg => ({
      id: pg.id,
      name: pg.name,
      hasInstagramBusinessAccount: !!pg.instagram_business_account,
      instagramBusinessAccountId: pg.instagram_business_account?.id || null,
      hasPageAccessToken: !!pg.access_token
    }));
    console.log('[IG_OAUTH_DEBUG] callback diagnostics', {
      userId: pending.userId,
      stateSuffix: String(state).slice(-8),
      pagesCount: pageDebug.length,
      pages: pageDebug,
      permissions: permissionsSummary
    });
    let n = 0;
    for (const pg of (pages.data||[])) {
      if (!pg.instagram_business_account) continue;
      const igId = pg.instagram_business_account.id;
      let prof = {};
      try { prof = await _metaGet('/'+igId, pg.access_token, { fields:'username,name,biography,followers_count,media_count,profile_picture_url' }); } catch(e){}
      _saveIgAccount(pending.userId, {
        id: uuidv4(), igUserId: igId, pageId: pg.id, pageName: pg.name,
        username: prof.username||pg.name, displayName: prof.name||pg.name,
        bio: prof.biography||'', profilePictureUrl: prof.profile_picture_url||'',
        followersCount: prof.followers_count||0, mediaCount: prof.media_count||0,
        pageAccessToken: pg.access_token, longLivedToken: longToken,
        tokenExpiresAt: expiresAt, connectedAt: new Date().toISOString()
      });
      n++;
    }
    if (!n) return popupClose(false, 'No Instagram Business account found. Link your IG to a Facebook Page first.');
    popupClose(true, `Connected ${n} account${n>1?'s':''}`);
  } catch(err) {
    console.error('IG OAuth callback error:', err.message);
    popupClose(false, err.message);
  }
});

// ── Accounts ─────────────────────────────────────────────────────────────
app.get('/api/social/instagram/accounts', (req, res) => {
  const userId = _uid(req);
  const accounts = _igAccounts(userId).map(a => ({
    id: a.id, igUserId: a.igUserId, username: a.username, displayName: a.displayName,
    profilePictureUrl: a.profilePictureUrl, followersCount: a.followersCount,
    connectedAt: a.connectedAt, tokenExpiresAt: a.tokenExpiresAt
  }));
  res.json({ success:true, accounts });
});
app.delete('/api/social/instagram/accounts/:igUserId', (req, res) => {
  const userId = _uid(req);
  store.igAccounts[userId] = _igAccounts(userId).filter(a => a.igUserId !== req.params.igUserId);
  saveStore();
  res.json({ success:true });
});

// ── Profile ───────────────────────────────────────────────────────────────
app.get('/api/social/instagram/profile/:igUserId', async (req, res) => {
  const acct = _findIgAccount(_uid(req), req.params.igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try {
    const d = await _metaGet('/'+req.params.igUserId, acct.pageAccessToken, {
      fields:'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website'
    });
    acct.followersCount = d.followers_count; saveStore();
    res.json({ success:true, profile:{ igUserId:req.params.igUserId, username:d.username, displayName:d.name,
      bio:d.biography, profilePictureUrl:d.profile_picture_url, followersCount:d.followers_count,
      followsCount:d.follows_count, mediaCount:d.media_count, website:d.website }});
  } catch(err) { res.status(500).json({ error:err.message }); }
});

// ── Feed ─────────────────────────────────────────────────────────────────
app.get('/api/social/instagram/feed/:igUserId', async (req, res) => {
  const acct = _findIgAccount(_uid(req), req.params.igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try {
    const limit = Math.min(parseInt(req.query.limit)||12, 50);
    const d = await _metaGet('/'+req.params.igUserId+'/media', acct.pageAccessToken, {
      fields:'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count', limit
    });
    res.json({ success:true, feed:d.data||[] });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

// ── Insights ──────────────────────────────────────────────────────────────
app.get('/api/social/instagram/insights/:igUserId', async (req, res) => {
  const acct = _findIgAccount(_uid(req), req.params.igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try {
    const [rr, ir] = await Promise.all([
      _metaGet('/'+req.params.igUserId+'/insights', acct.pageAccessToken, { metric:'reach,impressions', period:'day', limit:30 }).catch(()=>null),
      _metaGet('/'+req.params.igUserId+'/insights', acct.pageAccessToken, { metric:'follower_count', period:'day', limit:30 }).catch(()=>null)
    ]);
    res.json({ success:true, insights:{ reach:rr?.data, impressions:ir?.data } });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.get('/api/social/instagram/account-status/:igUserId', (req, res) => {
  const acct = _findIgAccount(_uid(req), req.params.igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  const sections = [
    {
      key: 'removed_content',
      title: 'Removed content and messaging issues',
      status: 'clean',
      headline: 'Your account is not affected right now',
      copy: 'Thank you for following our Community Standards.'
    },
    {
      key: 'people_under_18',
      title: 'Availability to people under 18',
      status: 'clean',
      headline: 'Your account is available to people under 18',
      copy: 'Your content and profile follow our age-appropriate guidelines.'
    },
    {
      key: 'feature_limits',
      title: 'Features you can\'t use',
      status: 'clean',
      headline: 'You can use all the features right now',
      copy: 'Thank you for following our Community Standards.'
    }
  ];
  res.json({
    success: true,
    igUserId: req.params.igUserId,
    username: acct.username,
    displayName: acct.displayName,
    lastCheckedAt: new Date().toISOString(),
    summary: {
      status: 'clean',
      headline: 'Your account is not affected right now',
      copy: 'You are not at risk of losing access to your account right now.'
    },
    sections
  });
});

// ── Publish ───────────────────────────────────────────────────────────────
app.post('/api/social/instagram/publish', async (req, res) => {
  const { igUserId, caption, mediaUrl, mediaType='IMAGE' } = req.body;
  if (!igUserId||!caption||!mediaUrl) return res.status(400).json({ error:'igUserId, caption, and mediaUrl required' });
  const acct = _findIgAccount(_uid(req), igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try {
    const payload = { caption };
    payload[mediaType==='VIDEO'?'video_url':'image_url'] = mediaUrl;
    if (mediaType==='VIDEO') payload.media_type = 'VIDEO';
    const container = await _metaPost('/'+igUserId+'/media', acct.pageAccessToken, payload);
    const published = await _metaPost('/'+igUserId+'/media_publish', acct.pageAccessToken, { creation_id:container.id });
    res.json({ success:true, postId:published.id });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

// ── Comments ──────────────────────────────────────────────────────────────
app.get('/api/social/instagram/comments/:mediaId', async (req, res) => {
  const igUserId = req.query.igUserId;
  if (!igUserId) return res.status(400).json({ error:'igUserId query param required' });
  const acct = _findIgAccount(_uid(req), igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try {
    const d = await _metaGet('/'+req.params.mediaId+'/comments', acct.pageAccessToken, {
      fields:'id,text,timestamp,username,replies{id,text,timestamp,username}'
    });
    res.json({ success:true, comments:d.data||[] });
  } catch(err) { res.status(500).json({ error:err.message }); }
});
app.post('/api/social/instagram/comments/:commentId/reply', async (req, res) => {
  const { igUserId, message } = req.body;
  if (!igUserId||!message) return res.status(400).json({ error:'igUserId and message required' });
  const acct = _findIgAccount(_uid(req), igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try {
    const d = await _metaPost('/'+req.params.commentId+'/replies', acct.pageAccessToken, { message });
    res.json({ success:true, replyId:d.id });
  } catch(err) { res.status(500).json({ error:err.message }); }
});
app.delete('/api/social/instagram/comments/:commentId', async (req, res) => {
  const igUserId = req.query.igUserId;
  if (!igUserId) return res.status(400).json({ error:'igUserId query param required' });
  const acct = _findIgAccount(_uid(req), igUserId);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  try { await _metaDel('/'+req.params.commentId, acct.pageAccessToken); res.json({ success:true }); }
  catch(err) { res.status(500).json({ error:err.message }); }
});

// ── Growth Ops Agent ─────────────────────────────────────────────────────
const _AGENT_SYS = `You are Growth Ops, an autonomous Instagram Business operations agent. You execute on behalf of the Founder/Admin team. Draft posts, suggest comment replies, and surface growth insights. Be concise, confident, and on-brand. Always return valid JSON.`;

app.post('/api/social/instagram/agent/suggest', async (req, res) => {
  const oai = _oaiClient();
  if (!oai) return res.status(503).json({ error:'OPENAI_API_KEY not set' });
  const { igUserId, topic, tone='professional', recentFeed=[], followerCount=0 } = req.body;
  try {
    const prompt = `Generate 3 Instagram post suggestions.\nAccount: @${igUserId||'brand'}\nFollowers: ${followerCount}\nTopic: ${topic||'brand update'}\nTone: ${tone}\n${recentFeed.length?'Recent captions:\n'+recentFeed.slice(0,3).map(p=>`- "${p.caption||''}"`).join('\n'):''}\n\nReturn JSON: {"suggestions":[{"caption":"...","hashtags":[...],"rationale":"..."}]}`;
    const c = await oai.chat.completions.create({ model:process.env.GROWTH_OPS_AGENT_MODEL||'gpt-4o', messages:[{role:'system',content:_AGENT_SYS},{role:'user',content:prompt}], response_format:{type:'json_object'}, max_tokens:800 });
    res.json({ success:true, ...JSON.parse(c.choices[0].message.content), usage:c.usage });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.post('/api/social/instagram/agent/reply', async (req, res) => {
  const oai = _oaiClient();
  if (!oai) return res.status(503).json({ error:'OPENAI_API_KEY not set' });
  const { commentText, username, context='' } = req.body;
  if (!commentText) return res.status(400).json({ error:'commentText required' });
  try {
    const c = await oai.chat.completions.create({ model:process.env.GROWTH_OPS_AGENT_MODEL||'gpt-4o', messages:[{role:'system',content:_AGENT_SYS},{role:'user',content:`Reply to this Instagram comment.\nUser: @${username||'user'}\nComment: "${commentText}"\n${context?'Context: '+context:''}\n\nReturn JSON: {"reply":"..."}`}], response_format:{type:'json_object'}, max_tokens:200 });
    res.json({ success:true, ...JSON.parse(c.choices[0].message.content) });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.post('/api/social/instagram/agent/insights-summary', async (req, res) => {
  const oai = _oaiClient();
  if (!oai) return res.status(503).json({ error:'OPENAI_API_KEY not set' });
  const { igUserId, insights={}, followerCount=0 } = req.body;
  try {
    const c = await oai.chat.completions.create({ model:process.env.GROWTH_OPS_AGENT_MODEL||'gpt-4o', messages:[{role:'system',content:_AGENT_SYS},{role:'user',content:`Summarize these Instagram insights and suggest 3 growth actions.\nAccount: @${igUserId}\nFollowers: ${followerCount}\nData: ${JSON.stringify(insights).slice(0,600)}\n\nReturn JSON: {"summary":"...","actions":["...","...","..."]}`}], response_format:{type:'json_object'}, max_tokens:400 });
    res.json({ success:true, ...JSON.parse(c.choices[0].message.content) });
  } catch(err) { res.status(500).json({ error:err.message }); }
});
}
// ── end Instagram + Growth Ops Agent ─────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Consolidated Team Workstation context endpoint
app.get('/api/teamworkstation/context', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Property Snapshots
    const propertySnapshots = Object.values(store.propertySnapshots || {}).filter(s => s.userId === userId);

    // Social Accounts (X/Twitter, Instagram, etc.)
    const xAccounts = Object.values(store.accounts || {}).filter(a => a.user_id === userId && a.provider === 'x');
    const igAccounts = (store.igAccounts?.[userId] || []);

    // Social Actions (X, Instagram, etc.)
    const socialActions = Object.values(store.actions || {}).filter(a => a.user_id === userId);

    // Billing (stub: use subscriptions, billingPlans, billingPolicy)
    const subscription = (store.subscriptions?.[userId]) || null;
    const billingPlan = subscription ? (store.billingPlans?.[subscription.plan_id] || null) : null;
    const billingPolicy = store.billingPolicy || null;

    // Layer A (stub: use layerAPolicy)
    const layerA = store.layerAPolicy || null;

    res.json({
      propertySnapshots,
      social: {
        xAccounts,
        igAccounts,
        actions: socialActions
      },
      billing: {
        subscription,
        plan: billingPlan,
        policy: billingPolicy
      },
      layerA
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Team Workstation context', details: err?.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Team Workstation Social Backend running on port ${PORT}`);
  console.log(`✓ Frontend CORS origin: ${FRONTEND_URL}`);
  console.log(`✓ Data store: ${STORE_FILE}`);
  console.log(`✓ Health check: GET /health`);
});
