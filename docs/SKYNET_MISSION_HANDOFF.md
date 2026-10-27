# SKYNET -> ProofPay AI Hackathon completion handoff

This public repository contains a working **local** ProofPay web application.
PayPal Developer Sandbox and a real local MiniLM model were tested in October
2026. The AI is only advisory; a human authorizes milestone approval.

## Implementation and test acceptance

1. Run `npm ci` and `npm test` with Node.js 22. All offline/mock network
   regressions must pass. The local MiniLM test downloads its model on the
   first run, so the very first setup needs an ordinary outbound connection.
2. Run `npm start`; visit `http://127.0.0.1:8777/` and
   `http://127.0.0.1:8777/mission-control`.
3. Confirm the difference between the local model's semantic result and the
   keyword-based evidence audit. Neither is proof of actual work.
4. Verify no payment order can be created without human milestone approval.
5. In genuine Sandbox mode use separate **Business seller** and **Personal
   test buyer** credentials, and confirm provider status and captured amount
   after buyer approval. Never use PayPal Live or real money.
6. Keep any OAuth access, passwords, account sessions, receipts and buyer
   identities out of the public repository, screenshots and issue comments.

## External submission gates

The organizer also requires a **public** source repo with an OSS license,
a **public YouTube demo** showing the actual app in under three minutes,
and a confirmed **Devpost submission** associated with PayPal AI Hackathon.

A private source ZIP and a recorded local video do not satisfy these public
requirements. Do not claim the contest entry is submitted until all public
links and the completed entry page have been independently verified. The
official submission deadline is November 12, 2026 at 12:00 PST (20:00 UTC).

Use `docs/DEVPOST_SUBMISSION_COPY_READY.md` as editable English entry text and
`docs/JUDGE_DEMO_PLAYBOOK.md` as the demonstration plan.

## Security and production boundaries

This is a local single-milestone prototype, **not** a production payment
processor. It lacks production login, tenancy, webhooks, escrow, chargeback
management and independently verified deliverable provenance. It should not
be publicly deployed as a real payment service without a separate audit.
