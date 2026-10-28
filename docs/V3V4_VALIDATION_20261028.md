# ProofPay V3/V4 – controlled validation (28 October 2026)

This branch is **development only**. Public Devpost and YouTube remain unchanged.

## Implemented in this workstream
- PDF/TXT attachment upload **up to 1 MiB**, PDF up to 12 pages. Extract text locally with `pdfjs-dist` (without OCR), calculate SHA-256, classify five explicit contract claims, show actual short page-linked quotations and reject missing/contradictory claims. This is **keyword-based document review**, not objective proof of delivery or document authenticity.
- Optional local MiniLM/Ollama advisor runs over extracted file text and remains purely advisory. Without model weights, `AI_PROVIDER=DISABLED` uses deterministic checks only.
- A separate private buyer token remains required for approval, order creation, capture, void and demo reset. This is **single-user prototype authorization**, not production multi-user identity management.
- PayPal AUTHORIZE order (Orders v2), buyer approval (PayPal JS SDK), server authorization (Orders v2), independent order GET verification, capture authorization (Payments v2) with independent capture GET verification, or void via Payments v2 with authorization GET verification.
- In default no-credential mode every payment action is explicitly simulated. There are **no live charges** in this branch.
- Server logs store document hash and claim statuses, not uploaded PDF bytes or full document body.

## Completed automated checks
- `npm test`: **85 tests passed / 0 failed** in Node 22 Linux on 28 October 2026.
- The 40 hand-labeled examples in `test/document-proof.test.mjs` all matched expected statuses. This measures **deterministic synthetic rule behavior**, not accuracy on independent or authentic documents.
- Synthetic valid PDF successfully parsed with real PDF.js library.
- Browser automation with Chromium: upload TXT, inspect evidence quotes, enter separate buyer token, manually approve, create **simulated** authorization, simulated capture, reset, simulated void; no JS page errors. Screenshots stored temporarily on the server.
- PayPal backend positive/negative API cases covered by mock fetcher; wrong merchant, amount, currency, ambiguous receipt, readback mismatch and double capture rejected in tests.

## Additional Windows laptop check (28 October 2026)
- Clean temporary unpack on Windows with Node 24.19.0 and `npm ci` succeeded; `node --test` excluding the live MiniLM model download **passed 84/84**.
- The full Windows run was not accepted as green: the first-run transformer model cache could not be renamed (`EPERM` while the test worker was being stopped). A controlled repeat with a complete local cache is required. This does **not** invalidate the independent full GitHub CI, but Windows AI readiness remains open.
- No Sandbox merchant credentials were configured in that test environment; all payment actions were mocked or simulated.

## Not yet verified – release-blocking
- No **new** actual PayPal Sandbox AUTHORIZE / CAPTURE / VOID run on this branch. Prior ProofPay Sandbox CAPTURE from 27 October concerns the **old immediate CAPTURE implementation**, not these new methods.
- No independent multi-platform Windows/macOS fresh clone test.
- No blind benchmark on externally sourced, independently labeled supplier documentation. Scanned or image-only PDFs have no OCR and are rejected.
- No provider webhooks, durable retry queue, expiring authorization monitoring, multicustomer login or production-grade merchant authorization. Do not represent this prototype as escrow or a production payment processor.
- The file-based claim classifier checks **mention of keywords**, not factual truth. A seller could fabricate a text file. Review original sources separately.
- No final new hackathon video made or uploaded from this workstream.

## To reproduce safely
```bash
npm ci
npm test
AI_PROVIDER=DISABLED npm start
```
Open `http://127.0.0.1:8777/`, upload a local PDF/TXT example, and copy the generated private token from `data/state.json.buyer-token` on the **same trusted machine**. Keep the token off screenshots and out of any repository commits.

To test PayPal using **test accounts only**, configure a merchant Sandbox REST application and a distinct personal Sandbox buyer via the PayPal Developer dashboard. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` privately in the process environment (never in files committed to GitHub). Verify order authorization, valid capture, void of a **second authorization**, amount/currency, merchant/payee, and independent readback; document the exact response IDs privately without exposing secrets. Authorized holds are not escrow. If Sandbox merchant eligibility denies AUTHORIZE, do **not** claim V4 is verified.

PayPal official guidance:
- https://developer.paypal.com/checkout/delay-capture/
- https://developer.paypal.com/checkout/void-authorized-payment/
- https://developer.paypal.com/api/payments/v2

## Release decision
**NO-GO for replacing the Devpost video** until the real V4 sandbox acceptance test, credible source-grounded V3 acceptance, independent peer review and final end-to-end 1080p narrated video all pass. Preserve public submission until then.
