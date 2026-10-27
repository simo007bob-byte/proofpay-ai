# ProofPay AI — PayPal Sandbox validation evidence

This is a reproducible, **Sandbox-only** technical test record for hackathon
judges. The project does not process real money, connect to PayPal Live, have
paying customers, or claim a contest prize.

## What is verified

The original SKYNET payment adapter (the same `src/paypal.mjs` class as the
ProofPay app) successfully communicated with the **actual PayPal Developer
Sandbox API** during an authorized, private October 2026 test:

1. REST app OAuth was successfully obtained from PayPal's Sandbox.
2. PayPal Orders v2 created a fixed-amount EUR **test** order.
3. A **separate Sandbox Personal test buyer** approved that order.
4. PayPal Orders v2 returned a successful capture and a subsequent remote
   GET independently reported `COMPLETED` with the captured amount/currency.

A second test exercised the **actual ProofPay browser application**:

1. Its local ONNX-based embedding AI analyzed example delivery evidence.
2. Calling order creation before human approval was correctly rejected.
3. An explicit human-approval button was activated in Chrome.
4. The app's own `POST /api/create-order` created a real Sandbox order.
5. The server independently retrieved that exact order from PayPal and
   verified its amount and currency.

**Completed on 27 October 2026:** The second Sandbox test buyer approved
the ProofPay app's own order. SKYNET then sent `POST /api/capture` to the
original ProofPay application and independently verified the resulting
`COMPLETED` captured Sandbox payment using PayPal Orders v2 GET.
Both the original application's persisted state and the PayPal provider
receipt agree. The first adapter-level Sandbox capture and second ProofPay
app end-to-end capture are separate verified tests.
Private credentials, buyer account access, and transaction receipts are
deliberately not included in this public-source-ready repository.

## Reproduce using your own FREE Sandbox accounts

1. Use Node.js 22 or newer (Node.js 20+ is declared in package.json).
2. Run `npm ci` and `npm test`. The automated tests use a simulated
   PayPal transport, and do **not** charge or call any PayPal account.
3. In the PayPal Developer Dashboard create a **Sandbox** REST app,
   merchant Business test account, and separate buyer Personal test account.
4. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` as private environment
   variables. Never put them in a repository, issue, public log or video.
5. Run `npm start` from the local project directory. The server binds to
   `127.0.0.1:8777` (not public).
6. Open `http://127.0.0.1:8777/`. Use **Load example → Analyze evidence**.
   Verify local AI analysis; the server must reject payment before explicit
   **Human approval**.
7. Click **Approve this milestone**. The PayPal SDK provides the real Sandbox
   checkout button. Choose the distinct **Sandbox Personal buyer** account
   and approve the displayed test payment.
8. Confirm the app and PayPal both show `COMPLETED` and the Sandbox capture
   details match the example price and currency. The `/mission-control`
   visualization should display the same persisted app status.

## Human approval and trust boundaries

- The AI score is advisory similarity, **not proof** of work delivered.
- Human milestone approval and Sandbox buyer checkout approval are separate.
- A merchant **cannot** approve their own test purchase using their Business
  sandbox account.
- The counterfactual mode in Evidence Constellation changes presentation
  only, not server state or PayPal transactions.
- PayPal Live endpoints are never supported or exercised.
- This remains a **loopback-only development prototype**. There is no
  production user authentication, tenant isolation or webhook infrastructure.
- Do not use real payment credentials or actual customer data.

## Submission evidence discipline

Judges can run the app locally from the repository, as permitted by the
hackathon rules. Private Sandbox receipts are never bundled in source code.
An organizer who wants to see a real PayPal Sandbox run can create their own
free Sandbox app and test accounts using the steps above. Recorded video
must show what was actually executed, distinguish Sandbox from simulation,
and show the independently verified application-level capture accurately.
