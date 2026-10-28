# ProofPay AI — PayPal Sandbox Release Gate

**Status:** Open. This is a verification checklist, not a release certificate. Existing Devpost and YouTube links must not be changed until it is completed.

## Already verified (28 October 2026)
- PR #3 contains PDF/TXT parsing, five document claim excerpts, buyer-token control, the AUTHORIZE → CAPTURE or VOID workflows, and local browser simulations.
- 87/87 automated Linux tests passed; 86/86 Windows tests passed excluding the known first-run AI model-download case.
- The PayPal REST API host responds over TLS from the project server; unauthenticated requests get HTTP 401 as expected (network connectivity only).
- PayPal header `Prefer: return=representation` is now explicitly present in `authorizedRequest`, with a regression test. GitHub Actions passed for PR head `0365d4c99316`.
- A historical successful sandbox capture (27 October) used the previous immediate-capture implementation, *not this new authorization code*.

## Missing real PayPal sandbox acceptance
1. Log in locally to the official [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/). Confirm the **Sandbox** tab and an appropriate Business test application are selected.
2. In **Apps & Credentials**, make the Sandbox Client ID and Secret available **only to the trusted local application process**. Never put them in ChatGPT, GitHub, browser developer-console snippets, recordings, emails, repository files, or logs.
3. In **Testing Tools → Sandbox Accounts**, use a **Personal** sandbox buyer account distinct from the **Business** sandbox seller. Do not use a real payment method or personal live account.
4. Start the **tested development branch** locally on the buyer's machine with localhost binding. Confirm `/api/state` returns `PAYPAL_SANDBOX`, not `SIMULATION_ONLY`; do not expose the buyer token.
5. Positive flow: buyer creates an AUTHORIZE order with the fixed server-controlled EUR amount; in the actual PayPal Sandbox buyer UI approve the order; POST order authorization; independently GET and inspect order/authorization ID, amount, currency, merchant and current authorization status.
6. Supplier uploads a locally parsed PDF/TXT document; inspect the real page excerpts. Authorized buyer approves. Capture the authorization; independently GET the capture and verify the same currency, amount and capture ID. No claim of real money being transferred.
7. Negative flow: create a **separate** authorization and void it. Independently GET authorization and verify VOIDED; attempt to capture after void and verify rejection.
8. Security checks: reject wrong order ID; wrong merchant, amount and currency; double capture; capture without an authorized order; capture before document and buyer acceptance; document contradiction and prompt-injection examples.
9. Capture only redacted logs/screenshots for a reviewer. Record UTC test date, exact verified API operation, test result, and code commit. Do not publish personal test account details or API secrets.

## Video and submission release
- Record the actual paid API paths, not a mock replay presented as real.
- Use native Full-HD readable product shots, clear original narration, no exposed private data, and validate final upload audio/visuals on YouTube at manually selected 1080p.
- Preserve the existing Devpost submission until a new YouTube video has passed playback checks; update the embedded Devpost URL only after verified publication.
- If any real Sandbox step cannot be completed, leave this checklist open. Do not claim PayPal approval/certification, escrow, payment processing readiness, guaranteed prize money, or genuine V4 Sandbox completion.

**Authoritative PayPal references**
- https://developer.paypal.com/api/get-started/
- https://developer.paypal.com/checkout/delay-capture/
- https://developer.paypal.com/api/payments/v2/
- https://developer.paypal.com/sandbox-testing/overview/
