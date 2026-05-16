#!/usr/bin/env node
'use strict';

const baseUrl = (process.env.LAYER_A_BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
const userId = process.env.LAYER_A_TEST_USER || 'layer-a-contract-ci';

function fail(message, detail) {
  const suffix = detail ? `\n${JSON.stringify(detail, null, 2)}` : '';
  throw new Error(`${message}${suffix}`);
}

async function api(path, options = {}) {
  const headers = {
    'X-User-ID': userId,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => '');

  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

function requireEqual(label, actual, expected, detail = {}) {
  if (actual !== expected) {
    fail(`Invariant drift: ${label}. Expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`, detail);
  }
}

function requireTrue(label, condition, detail = {}) {
  if (!condition) fail(`Invariant drift: ${label}`, detail);
}

async function main() {
  console.log(`[LayerA] Contract test start: ${baseUrl}`);

  const initial = await api('/api/layer-a/state');
  if (!initial.ok) fail('Unable to read /api/layer-a/state', initial);

  const originalPolicy = initial.body?.policy;
  const originalControl = initial.body?.control;
  if (!originalPolicy || !originalControl) {
    fail('Layer A state payload missing policy/control', initial.body);
  }

  const patch = {
    entitlement: {
      warning_threshold_pct: 0.84,
      grace_loop_unlocks: 5,
      max_unlock_ledger_entries: 12000
    },
    approvals: {
      support_review_gate: true,
      follower_threshold: 65000
    },
    sla_tiers: {
      p1_target_minutes: 12,
      p2_target_minutes: 55,
      p3_target_minutes: 220
    },
    safety: {
      degradeMode: 'normal',
      monetizationKillSwitch: false,
      operationsKillSwitch: false
    }
  };

  try {
    const updated = await api('/api/layer-a/policy', { method: 'POST', body: patch });
    if (!updated.ok) fail('Policy patch failed', updated);

    const state = await api('/api/layer-a/state');
    if (!state.ok) fail('Unable to reread state after patch', state);

    const policy = state.body?.policy || {};
    const control = state.body?.control || {};
    requireEqual('warning_threshold_pct', policy.entitlement?.warning_threshold_pct, patch.entitlement.warning_threshold_pct);
    requireEqual('grace_loop_unlocks', policy.entitlement?.grace_loop_unlocks, patch.entitlement.grace_loop_unlocks);
    requireEqual('max_unlock_ledger_entries', policy.entitlement?.max_unlock_ledger_entries, patch.entitlement.max_unlock_ledger_entries);
    requireEqual('support_review_gate', policy.approvals?.support_review_gate, patch.approvals.support_review_gate);
    requireEqual('follower_threshold', policy.approvals?.follower_threshold, patch.approvals.follower_threshold);
    requireEqual('p1_target_minutes', policy.sla_tiers?.p1_target_minutes, patch.sla_tiers.p1_target_minutes);
    requireEqual('degradeMode', control.degradeMode, patch.safety.degradeMode);

    const matrix = await api('/api/layer-a/contract-matrix');
    if (!matrix.ok) fail('Contract matrix endpoint returned failure', matrix.body);
    requireTrue('contract matrix success', matrix.body?.success === true, matrix.body);
    requireTrue(
      'all matrix checks pass',
      Array.isArray(matrix.body?.checks) && matrix.body.checks.every(c => c.pass === true),
      matrix.body?.checks
    );

    const proofJson = await api('/api/layer-a/export?format=json');
    if (!proofJson.ok) fail('JSON proof export failed', proofJson);
    requireTrue('proof JSON rows array exists', Array.isArray(proofJson.body?.rows), proofJson.body);

    const proofCsv = await api('/api/layer-a/export?format=csv');
    if (!proofCsv.ok) fail('CSV proof export failed', proofCsv);
    requireTrue('proof CSV has audit_id header', String(proofCsv.body || '').includes('audit_id'), {
      sample: String(proofCsv.body || '').slice(0, 150)
    });

    console.log('[LayerA] PASS - no invariant drift detected');
  } finally {
    const restore = await api('/api/layer-a/policy', { method: 'POST', body: originalPolicy });
    if (!restore.ok) {
      console.error('[LayerA] WARN - failed to restore original policy snapshot');
      console.error(JSON.stringify(restore.body, null, 2));
    }
    if (originalControl) {
      const restoreControl = await api('/api/system/control', {
        method: 'POST',
        body: {
          monetizationKillSwitch: !!originalControl.monetizationKillSwitch,
          operationsKillSwitch: !!originalControl.operationsKillSwitch,
          degradeMode: originalControl.degradeMode || 'normal'
        }
      });
      if (!restoreControl.ok) {
        console.error('[LayerA] WARN - failed to restore original control state');
        console.error(JSON.stringify(restoreControl.body, null, 2));
      }
    }
  }
}

main().catch((err) => {
  console.error('[LayerA] FAIL');
  console.error(err.message || err);
  process.exit(1);
});
