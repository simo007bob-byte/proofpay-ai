import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Docs-only regression: the judge package must stay honest about what does and does not work.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const README = read('README.md');
const PLAYBOOK = read('docs/JUDGE_DEMO_PLAYBOOK.md');
const GATES = read('docs/RELEASE_GATES.md');
const DOCS = { 'README.md': README, 'docs/JUDGE_DEMO_PLAYBOOK.md': PLAYBOOK, 'docs/RELEASE_GATES.md': GATES };

test('README documents independently verified Sandbox provider and ProofPay app captures', () => {
  assert.match(README, /PayPal Developer Sandbox: VERIFIED/);
  assert.match(README, /real Sandbox provider capture/i);
  assert.match(README, /buyer-approved application-level capture independently verified/i);
  assert.match(README, /No actual funds were transferred/i);
  assert.doesNotMatch(README, /real PayPal money transferred/i);
});

test('README documents both demo routes on loopback', () => {
  assert.ok(README.includes('`GET /`'));
  assert.ok(README.includes('`GET /mission-control`'));
  assert.ok(README.includes('http://127.0.0.1:8777/mission-control'));
  assert.match(README, /LOCAL DEMO ONLY/);
});

test('README separates simulated and real modes and states AI limits', () => {
  for (const s of ['simulated', 'mock HTTP transport', 'AI_PROVIDER=EMBEDDINGS', 'AI_PROVIDER=OLLAMA', 'AI_PROVIDER=DISABLED', 'not a generative LLM', 'not proof of work', 'Human approval'])
    assert.ok(README.includes(s), `README missing: ${s}`);
});

test('README setup commands match package scripts', () => {
  for (const cmd of ['npm ci', 'npm test', 'npm start']) assert.ok(README.includes(cmd), cmd);
  if (existsSync(join(root, 'package.json'))) {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.scripts?.test, 'package.json lacks test script');
    assert.ok(pkg.scripts?.start, 'package.json lacks start script');
  }
});

test('README references source files and docs that exist', () => {
  for (const f of ['src/core.mjs', 'src/paypal.mjs', 'src/server.mjs', 'docs/JUDGE_DEMO_PLAYBOOK.md', 'docs/RELEASE_GATES.md']) {
    assert.ok(README.includes(f), `README does not mention ${f}`);
    assert.ok(existsSync(join(root, f)), `${f} referenced but missing`);
  }
});

test('docs contain no credentials or live PayPal endpoints', () => {
  for (const [name, text] of Object.entries(DOCS)) {
    assert.doesNotMatch(text, /PAYPAL_CLIENT_(?:ID|SECRET)\s*[:=]\s*\S*[A-Za-z0-9_-]{16,}/, name);
    assert.doesNotMatch(text, /BEGIN [A-Z ]*PRIVATE KEY/, name);
    assert.doesNotMatch(text, /\bBearer\s+[A-Za-z0-9._-]{20,}/, name);
    assert.doesNotMatch(text, /api-m\.paypal\.com|api\.paypal\.com/, name);
  }
});

test('playbook storyboard fits under three minutes and covers the demo', () => {
  const ends = [...PLAYBOOK.matchAll(/\[(\d+):(\d{2})[–-](\d+):(\d{2})\]/g)].map((m) => Number(m[3]) * 60 + Number(m[4]));
  assert.ok(ends.length >= 6, 'storyboard needs timed segments');
  assert.ok(Math.max(...ends) < 180, 'storyboard must end before 3:00');
  for (const s of ['Evidence Constellation', 'Counterfactual', '/mission-control', 'human approval', 'not a generative LLM'])
    assert.ok(PLAYBOOK.includes(s), `playbook missing: ${s}`);
});

test('playbook covers five equally weighted judging criteria', () => {
  assert.match(PLAYBOOK, /equally weighted/i);
  assert.equal((PLAYBOOK.match(/^### Criterion [1-5]\b/gm) || []).length, 5);
});

test('docs make no prize, revenue or win claims', () => {
  for (const [name, text] of Object.entries(DOCS)) {
    assert.doesNotMatch(text, /\$\s?\d/, name);
    assert.doesNotMatch(text, /\b\d[\d,.]*\s*(?:USD|EUR)\b/, name);
    assert.doesNotMatch(text, /guaranteed?\s+(?:to\s+)?(?:win|prize|victory|revenue)/i, name);
    assert.doesNotMatch(text, /\b(?:award-winning|prize-winning|we won)\b/i, name);
  }
});

test('release gates cover every required area and stay unchecked', () => {
  for (const s of ['No live money', 'Redacted secrets', 'Webhook authenticity', 'Idempotency', 'CSRF', 'Session isolation', 'Public judge access', 'OSS license', 'YouTube', 'Submission evidence', 'Operator review'])
    assert.ok(GATES.includes(s), `RELEASE_GATES missing: ${s}`);
  assert.ok((GATES.match(/^- \[ \]/gm) || []).length >= 20);
  assert.doesNotMatch(GATES, /^- \[x\]/gim);
  assert.match(GATES, /does not deploy, publish, create PayPal orders or capture payments/i);
});
