# ProofPay Mission Control — Evidence Constellation

Open `http://127.0.0.1:8777/mission-control` after `node src/server.mjs`. The original app stays at `/`.

## 60-second demo narrative

1. **0–10s — The sky.** "This is ProofPay mission control. Five stars — Milestone, Evidence, AI/Uncertainty, Human Approval and PayPal — are the gates between finished work and money. Every state is read live from `GET /api/state`; nothing on this page is invented."
2. **10–20s — The mode badge.** "Top right says either *Genuine PayPal Sandbox configured* or, in amber, *SIMULATION ONLY*. You always know whether a real sandbox is behind the button."
3. **20–35s — Walk the constellation.** Tab to a star, use arrow keys, press Enter. "Each node shows exactly what the server reports — AI status, confidence and uncertainty reasons, or *No result* if AI is offline. A green path only lights when the previous gate is truly complete."
4. **35–50s — What-if.** Tick *Simulate: evidence is missing*. "The stage turns dashed amber and is labelled SIMULATION ONLY. Without evidence, AI cannot assess, a human should not approve, and PayPal stays locked. This is a client-only projection: no request is sent and no state changes."
5. **50–60s — The human decides.** Click *Open approval workflow*. "Approval and payment happen only in the existing workflow, by a person. AI advises; humans approve; PayPal pays only after that."

## Safety boundaries

- The page only issues `GET /api/state`; it cannot analyze, approve, create orders, capture or reset.
- Untrusted text (task, evidence, AI reasons, audit) is rendered with `textContent` only.
- Strict CSP: the single inline script is pinned by SHA-256 computed at server start; no external resources.
- Animations are disabled under `prefers-reduced-motion: reduce`.
- Tests: `node --test test/proofpay-demo_quality.test.mjs`.