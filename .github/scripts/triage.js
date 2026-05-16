/**
 * Lead Dev — Auto-Triage Script
 * Runs inside GitHub Actions after a CI check fails.
 * Steps:
 *  1. Fetch the failing check-run's annotations + log excerpt via GitHub API
 *  2. Identify referenced source files and read them from disk
 *  3. Call an LLM (Anthropic Claude preferred, OpenAI fallback) with full context
 *  4. Parse the structured response for file edits
 *  5. Apply edits, push a fix branch, open a draft PR
 *
 * Required env vars (from workflow):
 *   GH_TOKEN, REPO_OWNER, REPO_NAME, CHECK_RUN_ID, HEAD_SHA, HEAD_BRANCH, CHECK_NAME
 * At least one of:
 *   ANTHROPIC_API_KEY  — Claude 3.5 Sonnet (preferred)
 *   OPENAI_API_KEY     — GPT-4o (fallback)
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────
const GH_TOKEN         = required('GH_TOKEN');
const REPO_OWNER       = required('REPO_OWNER');
const REPO_NAME        = required('REPO_NAME');
const CHECK_RUN_ID     = required('CHECK_RUN_ID');
const HEAD_SHA         = process.env.HEAD_SHA  || 'HEAD';
const HEAD_BRANCH      = process.env.HEAD_BRANCH || 'main';
const CHECK_NAME       = process.env.CHECK_NAME || 'CI';
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY       = process.env.OPENAI_API_KEY;
const WORKSPACE        = process.env.GITHUB_WORKSPACE || process.cwd();

const MAX_FILE_BYTES   = 24_000;   // max chars per source file sent to LLM
const MAX_LOG_BYTES    = 8_000;    // max chars of raw check-run log
const FIX_BRANCH_BASE  = 'lead-dev/fix';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function required(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env var: ${name}`); process.exit(1); }
  return v;
}

async function ghFetch(endpoint, opts = {}) {
  const url = endpoint.startsWith('https')
    ? endpoint
    : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} ${url}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function setOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) fs.appendFileSync(file, `${key}=${value}\n`);
  else console.log(`OUTPUT ${key}=${value}`);
}

function git(...args) {
  return execSync(`git ${args.join(' ')}`, {
    cwd: WORKSPACE,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME:    'Lead Dev Bot',
      GIT_AUTHOR_EMAIL:   'lead-dev-bot@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'Lead Dev Bot',
      GIT_COMMITTER_EMAIL:'lead-dev-bot@users.noreply.github.com'
    }
  }).trim();
}

// ─── 1. Gather failure context from GitHub ───────────────────────────────────
async function gatherContext() {
  console.log(`\n[triage] Check run: ${CHECK_RUN_ID} (${CHECK_NAME})`);

  // Annotations (file + line references from the CI run)
  let annotations = [];
  try {
    annotations = await ghFetch(
      `/repos/${REPO_OWNER}/${REPO_NAME}/check-runs/${CHECK_RUN_ID}/annotations`
    );
  } catch (e) {
    console.warn('[triage] Could not fetch annotations:', e.message);
  }

  // Check run detail (output summary + text)
  let checkDetail = {};
  try {
    checkDetail = await ghFetch(
      `/repos/${REPO_OWNER}/${REPO_NAME}/check-runs/${CHECK_RUN_ID}`
    );
  } catch (e) {
    console.warn('[triage] Could not fetch check detail:', e.message);
  }

  const rawLog = [
    checkDetail.output?.title || '',
    checkDetail.output?.summary || '',
    checkDetail.output?.text || ''
  ].join('\n').slice(0, MAX_LOG_BYTES);

  console.log(`[triage] Annotations: ${annotations.length}  Log chars: ${rawLog.length}`);
  return { annotations, rawLog, checkDetail };
}

// ─── 2. Read referenced source files ─────────────────────────────────────────
function gatherSourceFiles(annotations, rawLog) {
  const fileSet = new Set();

  // From annotations
  for (const ann of annotations) {
    if (ann.path) fileSet.add(ann.path);
  }

  // From log — extract any path-like tokens (src/..., lib/..., etc.)
  const pathRe = /(?:^|\s)((?:src|lib|app|test|tests|__tests__|pages|api|backend|scripts)\/[\w/.\-]+\.\w{1,6})/gm;
  let m;
  while ((m = pathRe.exec(rawLog)) !== null) fileSet.add(m[1]);

  const sourceFiles = [];
  for (const rel of fileSet) {
    const abs = path.join(WORKSPACE, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const content = fs.readFileSync(abs, 'utf8').slice(0, MAX_FILE_BYTES);
      sourceFiles.push({ path: rel, content });
      console.log(`[triage] Loaded: ${rel} (${content.length} chars)`);
    } catch { /* skip unreadable */ }
  }

  return sourceFiles;
}

// ─── 3. Call LLM ─────────────────────────────────────────────────────────────
function buildPrompt(context, sourceFiles) {
  const annotationText = context.annotations.length
    ? context.annotations.map(a =>
        `${a.path}:${a.start_line}  [${a.annotation_level}]  ${a.message}`
      ).join('\n')
    : '(none)';

  const filesText = sourceFiles.length
    ? sourceFiles.map(f =>
        `\`\`\`\n// FILE: ${f.path}\n${f.content}\n\`\`\``
      ).join('\n\n')
    : '(no source files identified)';

  return `You are Lead Dev Bot — an autonomous senior engineer.
A CI check named "${CHECK_NAME}" just failed on branch "${HEAD_BRANCH}" at commit ${HEAD_SHA}.

## Failure log
\`\`\`
${context.rawLog || '(empty)'}
\`\`\`

## Annotations
\`\`\`
${annotationText}
\`\`\`

## Relevant source files
${filesText}

## Your task
1. Identify the root cause of the CI failure.
2. Produce the minimal code edits that fix it.
3. Respond with ONLY valid JSON matching this schema — no markdown wrapper:

{
  "canFix": true | false,
  "summary": "one-sentence description of the failure",
  "rootCause": "explanation of why it failed",
  "edits": [
    {
      "file": "relative/path/to/file.js",
      "search": "exact string to find and replace (must appear verbatim in the file)",
      "replace": "replacement string"
    }
  ],
  "prTitle": "fix: <concise title>",
  "prBody": "markdown body for the draft PR — include root cause, fix summary, and test plan"
}

Rules:
- Set canFix=false if you are not confident or if fixing requires secrets/env changes only.
- Each edit.search must be an exact verbatim substring of the file as shown above.
- Keep edits minimal — change only what is broken.
- Never delete test files or disable checks.`;
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callLLM(prompt) {
  if (ANTHROPIC_KEY) {
    console.log('[triage] Calling Anthropic Claude...');
    return callAnthropic(prompt);
  }
  if (OPENAI_KEY) {
    console.log('[triage] Calling OpenAI GPT-4o...');
    return callOpenAI(prompt);
  }
  throw new Error('No LLM key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in repo secrets.');
}

function parseLLMResponse(text) {
  // Strip accidental markdown fences
  const stripped = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (e) {
    console.error('[triage] LLM response was not valid JSON:\n', text.slice(0, 500));
    throw new Error('LLM did not return valid JSON');
  }
}

// ─── 4. Apply edits & open PR ────────────────────────────────────────────────
function applyEdits(edits) {
  const applied = [];
  for (const edit of edits) {
    const abs = path.join(WORKSPACE, edit.file);
    if (!fs.existsSync(abs)) {
      console.warn(`[triage] Edit target not found, skipping: ${edit.file}`);
      continue;
    }
    let content = fs.readFileSync(abs, 'utf8');
    if (!content.includes(edit.search)) {
      console.warn(`[triage] Search string not found in ${edit.file}, skipping`);
      continue;
    }
    content = content.replace(edit.search, edit.replace);
    fs.writeFileSync(abs, content, 'utf8');
    applied.push(edit.file);
    console.log(`[triage] Patched: ${edit.file}`);
  }
  return applied;
}

async function openPR(fix, appliedFiles) {
  const shortSha  = HEAD_SHA.slice(0, 7);
  const timestamp = Date.now();
  const branch    = `${FIX_BRANCH_BASE}-${shortSha}-${timestamp}`;

  // Set up remote auth and push branch
  git('config', 'user.email', '"lead-dev-bot@users.noreply.github.com"');
  git('config', 'user.name',  '"Lead Dev Bot"');
  git('remote', 'set-url', 'origin',
    `https://x-access-token:${GH_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git`
  );

  git('checkout', '-b', branch);
  git('add', ...appliedFiles);
  git('commit', '-m', `"${fix.prTitle}"`);
  git('push', 'origin', branch);

  console.log(`[triage] Pushed branch: ${branch}`);

  // Open draft PR
  const pr = await ghFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: fix.prTitle,
      head:  branch,
      base:  HEAD_BRANCH,
      body: [
        `> **Lead Dev Auto-Triage** — triggered by failed check \`${CHECK_NAME}\` on \`${HEAD_SHA.slice(0, 7)}\``,
        '',
        fix.prBody,
        '',
        '---',
        `_Generated by Lead Dev Bot · [View failing check](https://github.com/${REPO_OWNER}/${REPO_NAME}/runs/${CHECK_RUN_ID})_`
      ].join('\n'),
      draft: true
    })
  });

  console.log(`[triage] Draft PR opened: ${pr.html_url}`);
  return pr.html_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const context     = await gatherContext();
    const sourceFiles = gatherSourceFiles(context.annotations, context.rawLog);
    const prompt      = buildPrompt(context, sourceFiles);

    const rawResponse = await callLLM(prompt);
    const fix         = parseLLMResponse(rawResponse);

    console.log(`\n[triage] Summary:    ${fix.summary}`);
    console.log(`[triage] Root cause: ${fix.rootCause}`);
    console.log(`[triage] Can fix:    ${fix.canFix}`);
    console.log(`[triage] Edits:      ${(fix.edits || []).length}`);

    if (!fix.canFix || !fix.edits?.length) {
      console.log('[triage] No automated fix generated — analysis written above.');
      setOutput('pr_url', '');
      process.exit(0);
    }

    const applied = applyEdits(fix.edits);
    if (!applied.length) {
      console.log('[triage] Edits produced no file changes (search strings not found).');
      setOutput('pr_url', '');
      process.exit(0);
    }

    const prUrl = await openPR(fix, applied);
    setOutput('pr_url', prUrl);

  } catch (err) {
    console.error('[triage] Fatal error:', err.message);
    setOutput('pr_url', '');
    process.exit(1);
  }
})();
