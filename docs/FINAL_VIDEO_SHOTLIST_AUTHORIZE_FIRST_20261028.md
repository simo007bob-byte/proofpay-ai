# ProofPay AI — final judge video shot list (V4 authorize-first)

**Production status:** NOT READY TO PUBLISH. This is a final **recording plan**, not evidence that the new Sandbox API flow has passed. Do not replace the published 1080p video before the real PayPal authorization, capture and void are verified and the buyer approves the final video.

**Target:** 2:40–2:48, native 1920×1080, 30 fps, English narration, readable desktop text and focused shots. Do not show private buyer tokens, PayPal secrets, personal email addresses or payment methods.

| Timeline | Shot and mouse actions | Explicit proof for judges |
|---|---|---|
| 00:00–00:11 | Split view of a contractor claiming work finished and buyer worried about releasing payment | Hook: “A finished invoice doesn't mean the promised work has been delivered.” |
| 00:11–00:27 | Show the fixed municipal sweeper export milestone with the €29.00 *Sandbox sample only* price; buyer starts PayPal sandbox authorization | Buyer reserves before any supplier evidence; authorization is NOT escrow |
| 00:27–00:42 | Genuine PayPal Sandbox buyer approval and order authorize; hide credentials; show independent order GET/authorization state | Show actual AUTHORIZE approval, provider order/authorization ID redacted except last four, amount & currency |
| 00:42–01:02 | Supplier uploads intentionally incomplete PDF; use readable source excerpt and missing claim column | Locally extracted actual document pages with SHA-256; specific missing criterion |
| 01:02–01:13 | Buyer attempts capture without a supported document or approval | Clearly blocked with HTTP 403 and human-readable reason; no fake success |
| 01:13–01:35 | Supplier uploads corrected PDF; zoom in on each requirement and cited page passage | All five requirements have page-linked snippets; stress that text matching is not independent attestation |
| 01:35–01:48 | Authorized buyer checks original work and explicitly approves | Token never visible; no automated payout decision |
| 01:48–02:08 | Buyer captures the held test authorization; independent PayPal GET confirms capture amount, currency and ID | Real Sandbox readback, not a mock; no real funds |
| 02:08–02:26 | Demonstrate separate authorized sample hold then void; display independent PayPal authorization GET with VOIDED | Second real Sandbox case; prevents later capture |
| 02:26–02:40 | Review audit trail and optional CPU MiniLM advisory; show open source quickstart | Not escrow; privacy by default; reproducible tests |
| 02:40–02:47 | Closing slate “Evidence first. Payment second.” with GitHub and Devpost project URLs | Clear close, no prize or victory claims |

## Recording QA (no exceptions)
1. Clear final state from the **single-user local test environment only**; never delete real audit history. Confirm SANDBOX configuration; screen and narration should **not** label a simulated process as real.
2. Test each intended buyer action with two distinct official PayPal Developer Sandbox accounts, merchant vs buyer. Complete 2 actual holds: capture one, void the other. Independent provider API GET must agree with response data.
3. Record **native** browser window sized for legibility; do not upscale a tiny full-dashboard view. Each excerpt and status should be readable on a mobile preview. Avoid cutting off panels/scrollbars.
4. Text on shots: aim 22+ px. Make mouse clicks visible, maintain a short wait for provider responses and cut out network dead time without implying the API returned earlier.
5. Export H.264 1920×1080/30fps at high quality and AAC audio; narration independently listen-checked. Aim integrated -16 LUFS, true peak no more than -1.5 dBTP.
6. Inspect frames at 0, 12, 28, 45, 65, 92, 115, 135, 160 seconds. Watch the final MP4 end-to-end and YouTube playback with 1080p manually selected, plus mobile-sized preview.
7. Run independent clean-clone tests, sandbox acceptance and security-negative tests. Store receipts privately/redacted in `docs/V3V4_VALIDATION_20261028.md`; do not publish original identities or credentials.
8. Only then upload **new** YouTube video, verify 1080p processing and sound, update Devpost video URL once, and re-open public Devpost project to confirm embedding.

## Narration principles
Use concise natural English, not dramatic jargon. Speak only about on-screen actions and verified status; describe MiniLM as an **advisory local embedding model**, not as an LLM judge that “proves” delivery. Use “PayPal Sandbox authorization” rather than “money in escrow.”

## Release blockers on 28 October 2026
The first 87 Linux test cases and a simulation-only Chromium flow passed. GitHub CI passed at commit `932b29b1`. **Live Developer Sandbox account authorization is not available in this session**; the user's browser redirects to PayPal login and there is no configured private merchant test credential pair. A genuinely recorded V4 payment remains pending. The new public video has **not** been produced or uploaded.
