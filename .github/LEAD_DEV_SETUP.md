# Lead Dev — Auto-Triage Setup

## What it does
When any CI check fails, the `lead-dev-triage` workflow:
1. Fetches the failure log and file annotations from GitHub
2. Reads the referenced source files
3. Asks Claude (or GPT-4o) to diagnose the root cause and produce a minimal fix
4. Pushes a `lead-dev/fix-*` branch and opens a **draft PR** for your review

You review, edit if needed, and merge. Lead Dev does the first 80%.

---

## Repository secrets to add
Go to **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (preferred — Claude Sonnet) |
| `OPENAI_API_KEY` | Your OpenAI API key (fallback — GPT-4o) |
| `GH_PAT` | A GitHub Personal Access Token with `repo` + `pull_requests: write` scope |

At least one LLM key is required. `GH_PAT` is needed to push branches and open PRs; if omitted, the built-in `GITHUB_TOKEN` is used (works only if branch protection doesn't block Actions).

---

## Files
```
.github/
  workflows/
    lead-dev-triage.yml   ← workflow trigger + job definition
  scripts/
    triage.js             ← triage logic (no npm deps — pure Node 20)
```

---

## Manual trigger
To triage any past failure without waiting for a new one:

1. Go to **Actions → Lead Dev — Auto-Triage Failures → Run workflow**
2. Paste the check run ID (visible in the GitHub URL when you open a failed check)
3. Optionally paste the commit SHA

---

## Extending
- **More context** — edit `gatherSourceFiles()` in `triage.js` to also read config files, test fixtures, or `package.json`.
- **Sentry alerts** — add a second workflow triggered by a webhook from Sentry, passing the error group URL as context.
- **Slack notification** — after the draft PR is opened, add a `curl` step to post the PR URL to your team channel.
- **Auto-merge low-risk fixes** — change `draft: true` to `draft: false` and add a `gh pr merge --auto` step after the PR is opened (not recommended without test coverage gates).
