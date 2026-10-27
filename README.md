# ProofPay AI — Verified Work. Confident Payments.

**Status:** working local prototype with real CPU-run transformer AI (an embedding model). **PayPal Developer Sandbox: VERIFIED for an authorized private test setup.** In October 2026, the SKYNET integration created a real Sandbox order through PayPal Orders v2, received a Sandbox buyer's approval, captured a test payment, and independently verified its completed status with PayPal. Separately, the original ProofPay app was exercised in a real browser through local AI, the human approval gate, and a genuine Sandbox order creation; **the actual ProofPay app's second Sandbox order was also approved by a separate test buyer, captured using its original app endpoint, and verified COMPLETED by PayPal on 27 October 2026.** A fresh checkout with no credentials still runs in explicitly simulated mode. **This project has not yet been submitted to the competition.** No actual funds were transferred.

ProofPay belongs to the existing Hermes-SKYNET project. This repository is a working prototype. It is not proof that SKYNET agents (Astra Planner, Testsmith, Builder) autonomously produced a finished hackathon entry.

## What it does
ProofPay is for freelancers, agencies and cross-border service businesses. A buyer compares milestone-delivery evidence against the agreed requirement, with help from an optional local AI advisor. A human then explicitly approves the milestone, and only after that is checkout offered. ProofPay is not escrow and never authorizes payment automatically.

## Requirements
- Node.js 20 or newer, with npm.
- No paid API and no PayPal account are needed for the default simulated mode.
- The first AI run downloads public ONNX weights for onnx-community/all-MiniLM-L6-v2-ONNX once, so it needs network access that one time. Use AI_PROVIDER=DISABLED for fully offline runs.

## Local setup
```bash
npm ci
npm test
npm start
```
By default the server binds to 127.0.0.1:8777. Do not bind it to a public interface.

## Demo routes
| Route | Use |
|---|---|
| `GET /` | Original workflow at http://127.0.0.1:8777/ — Load example → Analyze evidence → Human approval → Simulated checkout |
| `GET /mission-control` | Judge-facing Mission Control at http://127.0.0.1:8777/mission-control, an overview of the same workflow that includes the Evidence Constellation demo |

Before recording or submitting, open both routes locally and confirm that they render (see docs/RELEASE_GATES.md).

## Modes: mock vs real
| Area | Mode | Status |
|---|---|---|
| Payments | Simulated checkout (default, no credentials) | Works locally. This is NOT a PayPal integration. |
| Payments | PayPal Developer Sandbox (credentials in environment) | Real provider OAuth, order creation, buyer approval, and test capture verified in the original SKYNET integration; ProofPay application-level order creation verified via real browser, with buyer-approved application-level capture independently verified through PayPal Orders v2. No real funds moved. Judges bring their own Sandbox credentials. |
| Payments | Live PayPal | Not supported. The connector is sandbox-only. |
| AI | AI_PROVIDER=EMBEDDINGS (default) | Real local MiniLM embedding model running on CPU through @huggingface/transformers (Apache-2.0) |
| AI | AI_PROVIDER=OLLAMA | Optional local instruct model provisioned by the operator. OLLAMA_MODEL is set by the operator, and OLLAMA_BASE_URL is restricted to loopback. |
| AI | AI_PROVIDER=DISABLED | Lexical assessment only, for offline tests |

## Human approval
AI output is decision support only. Human approval of the milestone is mandatory before checkout is offered. In Sandbox mode the buyer must also approve the order inside PayPal. Evidence text is treated as untrusted. Instruction-injection patterns (for example, ignore previous instructions or approve this payment) force REVIEW_REQUIRED and can never approve anything.

## AI limitations
- MiniLM is an embedding similarity model and not a generative LLM. It scores how semantically similar the requirement and the evidence are.
- A high score is not proof of work. The model cannot open files, run deliverables, check URLs or detect fabricated evidence.
- The model is English-centric. Scores on very short or non-English evidence are less reliable.
- Ollama output depends on the model the operator chooses and is not covered by the automated tests.
- A future Hermes-SKYNET adapter for Astra Max is not included in this prototype.

## PayPal Developer Sandbox: repeat the real integration
1. Register or use a PayPal Developer account and create a **Sandbox**, never Live, REST app at https://developer.paypal.com/dashboard/.
2. Use distinct Sandbox business (merchant) and Sandbox personal (buyer) accounts. Do not approve your own merchant's purchase.
3. Set the Sandbox credentials as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` only in your private shell. Never commit keys, use real PayPal credentials, or place credentials in GitHub issues or screenshots.
4. Restart the local server, submit a sample milestone, run the local AI analysis, and explicitly click Human Approval.
5. Complete Checkout with the **Sandbox Personal** buyer, then confirm that the Sandbox Order was created and captured. Do not confuse initial order status CREATED with completed payment status COMPLETED.
6. On your own PayPal dashboard, independently review order, captured amount, and currency. The existing private SKYNET evidence confirms a real Sandbox provider capture; the actual ProofPay app's separate buyer-approved capture has now also been independently verified.

See `docs/PAYPAL_SANDBOX_VALIDATION.md` for a truth-preserving validation matrix and detailed acceptance steps. Any judge can reproduce the project locally with their own free PayPal Developer Sandbox credentials.

The backend uses POST https://api-m.sandbox.paypal.com/v1/oauth2/token, POST /v2/checkout/orders and POST /v2/checkout/orders/{id}/capture. Amounts are fixed on the merchant side, and requests carry PayPal idempotency identifiers. Credentials are never returned to the browser.

## Safe credentials handling
- Use only Sandbox credentials, never production ones.
- Keep credentials in environment variables only. Never commit .env files, and never paste credentials into chat, Telegram, GitHub issues, screenshots or video.
- Redact access tokens and secrets from logs before sharing them.
- Rotate the Sandbox secret immediately if it is exposed.

## Tests
npm test runs the node:test suites in test/. They cover evidence assessment and injection detection, the HTTP approval workflow, PayPal calls against a mock HTTP transport, and local CPU model inference. test/proofpay-judge_readiness.test.mjs checks that this README and the judge docs stay accurate. No test makes real PayPal calls.

## Judge package
- docs/JUDGE_DEMO_PLAYBOOK.md: storyboard for a video under three minutes
- docs/RELEASE_GATES.md: security and submission checklist that must pass before anything is published
- docs/PAYPAL_SANDBOX_VALIDATION.md: genuine provider checks and completed ProofPay app Sandbox E2E
- docs/SKYNET_MISSION_HANDOFF.md: original SKYNET acceptance criteria

## Hackathon status
Official rules: https://paypalaihackathon.devpost.com/rules

- [x] Functional local website and milestone approval workflow
- [x] PayPal Sandbox Orders v2 backend code verified with mock HTTP transport tests and real provider API calls in SKYNET's private Sandbox
- [x] Real local transformer AI with no paid API
- [x] Automated node:test suites
- [x] English setup documentation
- [x] Real PayPal SANDBOX order created, approved by a Sandbox buyer and captured via SKYNET's original PayPal adapter, verified by PayPal Orders v2 GET
- [x] Original ProofPay browser -> local AI -> human approval -> genuine Sandbox order creation tested
- [x] Original ProofPay browser application -> Sandbox buyer approval -> original-app capture -> verified provider receipt, 27 October 2026
- [ ] Release gates in docs/RELEASE_GATES.md passed and signed off by an operator
- [ ] Public OSS repository without private SKYNET data or secrets
- [x] Public YouTube demo video (2:15): https://www.youtube.com/watch?v=ndGIOVZBhBc
- [ ] Devpost submission before the deadline in the official rules
- [ ] Production security review

No prize or placement is guaranteed.

## Architecture
- src/core.mjs: evidence assessment, injection detection, human approval and audit journal.
- src/ai.mjs: local AI advisor (embeddings or loopback Ollama). It cannot approve payment.
- src/paypal.mjs: sandbox-only PayPal Orders API adapter.
- src/server.mjs: Node HTTP app that binds to 127.0.0.1 by default.
- web/index.html: browser frontend. The PayPal JS SDK loads only after approval.
- test/: independent Node tests.

## Security boundaries
This is a **LOCAL DEMO ONLY**. It has no login or session separation, no internet-facing CSRF hardening and no signature-verified webhook reconciliation yet. Do not expose it publicly. The sandbox-only connector cannot move real money.

## License
MIT. Confirm that the LICENSE file is present before publishing.
