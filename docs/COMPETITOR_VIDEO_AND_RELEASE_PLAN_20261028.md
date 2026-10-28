# ProofPay AI — competitor-informed final-demo plan (28 October 2026)

## Research and evidence boundary
Public hackathon submission pages were checked. The full competitor YouTube videos were **not** frame-by-frame reviewed because YouTube's direct playback blocked automated access and the connected scene-analysis provider had insufficient credits (no charge). The following observations describe demo sequences *documented by the entrants*, not verified frame timestamps.

| Project | Public demo / entry | What they claim to demonstrate | Lesson for ProofPay |
|---|---|---|---|
| Handshake | https://youtu.be/XuS3PQi1QNw / https://devpost.com/software/handshake-by-radost-it | Buyer approves a PayPal `AUTHORIZE` hold, evidence verification, capture, policy defense and audit/debug IDs | Show a complete real Sandbox hold-to-settlement lifecycle and source-backed verification |
| Pawhold | https://youtu.be/ktTieJGmkjw / https://devpost.com/software/pawhold | Itemized estimate, explicit buyer consent, PayPal authorization, capture/void; separates seeded reauthorization from live checks | Clearly show whose approval is required and distinguish tested from simulated paths |
| Purser | https://youtu.be/3e2EhTpMcA0 / https://devpost.com/software/purser | AI prepares a ledger, rogue payment blocked, PayPal Sandbox checkout, refund and audit log | One convincing failure case plus one successful payment beats many slides |
| PayPal AI Checkout Agent | https://youtu.be/j6Ywx5pmTY4 / https://devpost.com/software/paypal-ai-checkout-agent | User request to order and Sandbox checkout; hosted demo | Make the user's intended outcome understandable within 10 seconds |

## Why we could stand out
**ProofPay's differentiator must be verifiable privacy-preserving acceptance of actual B2B files.** A local model, cited lines from genuine source files, buyer-controlled approval, and a separate hard-coded PayPal decision boundary would be more specific than generic shopping-agent escrow. This is a *product target*, not yet a verified feature.

## Hard release prerequisites (no exceptions)
- V3: Parse PDF/TXT locally and safely, attach immutable hashes, show required claims **and supporting passages**, reject missing/contradictory evidence. Verify against labeled negative/positive cases; publish the measured metrics.
- P0: Buyer-token gate on approval, create order, capture and void. This is prototype authorization, not complete multi-user authentication.
- V4: Show genuine PayPal Developer Sandbox `AUTHORIZE` and subsequent `CAPTURE` or `VOID`; verify via independent PayPal API readback. Never claim an authorization is an escrow account.
- Replay a **rejected case** and a **successful case** with visible labels. No hidden prerecorded fake provider responses.
- Clean clone + CI tests + a judge's documented quickstart. No credential disclosure and no paid dependencies required for a local demonstration.

## Proposed final narrative (target 150–165 seconds; contest max under 3 minutes)
| Time | Video scene | Judge-visible proof |
|---|---|---|
| 0–10s | The problem: paid for a service that was never actually delivered | One-line concrete value proposition, not a logo reel |
| 10–28s | Buyer sets an explicit work contract for a EUR 29 sample milestone | Real running app, fixed amount, supplier and buyer roles |
| 28–55s | Supplier uploads an actual sample file; AI checks five acceptance criteria | File name, SHA-256, claimed passages with source references, one missing criterion |
| 55–72s | Attempt to get paid for incomplete or injected evidence | Actual blocked decision and explainable reason; no fictional screenshots |
| 72–91s | Buyer reviews corrected file and explicitly approves | Authorized buyer control, not the seller pressing the same button |
| 91–118s | PayPal Developer Sandbox authorization on the buyer page | Genuine Sandbox provider screen and PayPal order ID, masking secrets |
| 118–137s | On delivery verification, capture test authorization; separately show void for rejection | Genuine provider response or distinctly labeled simulation if not yet integrated |
| 137–151s | Readback receipt and audit trail | Exact amount/currency, capture ID, idempotency, no real funds |
| 151–162s | Close: local/private AI, reproducible repo and next steps | Why this differs, with GitHub link, no fabricated metrics |

## Video production / quality acceptance
1. Record the product at native 1920×1080 30fps or better. Avoid an all-in-one giant dashboard shot: one task per shot, with readable 22px+ source text and focused non-destructive camera crops. Do not crop navigational context, price, the decision reason or PayPal verification.
2. Use clear English narration timed to actions. No background drone/noise: speech-normalize around -16 LUFS integrated, true peak <=-1.5 dBTP, verify audio by actual listening and waveform/silence tests.
3. Show visible cursor clicks and wait for network results. A success overlay must never precede the actual provider confirmation.
4. Check frames at 0, 10, 25, 45, 65, 90, 110, 130 and end. Watch final rendered MP4 end-to-end at 1080p and separately at YouTube's auto-selected quality. Confirm text legible on a phone-sized preview.
5. Expose no secrets, test buyer email addresses, private access tokens or personal identifying details. Distinguish real Sandbox from mock; label historical integration tests as historical.
6. Publish only after a **green test matrix, visually verified real Sandbox demo, reviewed final media, and user-visible link verification**. Until then leave current YouTube and Devpost videos untouched.

## Money and judging reality
Official rules: five equally weighted categories, including end-to-end presentation. Grand prize is USD 12,000, and the maximum combination for one project is one Grand Prize **plus one Sponsor Prize** (at most USD 5,000 based on advertised sponsor categories), not USD 20,000 EUR. See https://paypalaihackathon.devpost.com/rules . Submission deadline 12 Nov 2026 12:00 PST = 21:00 Berlin.
