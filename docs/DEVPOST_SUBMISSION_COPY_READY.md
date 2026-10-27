# Devpost Submission — ProofPay AI

**STATUS: Officially submitted to the PayPal AI Hackathon on 27 October 2026.** Devpost confirmed: "Project submitted!".

## Project name
ProofPay AI — Evidence First, Payment Second

## Tagline
Local AI reviews milestone delivery evidence before payment. Humans make the final decision, and PayPal Sandbox handles secure test checkout.

## Inspiration
Freelancers, agencies, and cross-border service teams often face the same challenge at milestone handoff: how can a buyer judge whether the work matches the original agreement before paying? A checkout button does not answer that question. ProofPay puts the assessment of work evidence before the payment decision.

## What it does
The working prototype starts with a sample €29 service milestone: a tender analysis with specifications, supplier comparisons, deadlines and cited sources. The buyer submits evidence of work. ProofPay evaluates the text against the agreed milestone through two separate systems: deterministic evidence checks that produce audit reasons, and an advisory MiniLM transformer running locally on CPU. The local model estimates semantic similarity; it cannot prove a deliverable is authentic, complete or high-quality.

**The model cannot approve a payment.** After reviewing the evidence and the AI suggestion, a human must explicitly approve the milestone. Only then can the original application create a PayPal Sandbox order. A separate Personal Sandbox buyer account must approve checkout before the application's payment capture step.

On 27 October 2026 this complete application-level sequence was tested against the real PayPal Developer Sandbox. It included local AI evaluation, explicit human approval, an order created by the original web application, buyer authorization, capture through the original app, and independent readback from PayPal Orders v2 confirming **COMPLETED**. The payments used test money; **no real funds were transferred**.

## How it works
ProofPay uses a local Node.js HTTP server, a browser workflow for evidence submission and approval, and a second read-only visualization called **Evidence Constellation**. Five linked nodes represent the milestone, evidence, AI uncertainty, human approval and PayPal payment state. A clearly labeled "What if evidence is missing?" mode changes only the browser visualization, never the underlying server or PayPal transaction.

The server controls the payment amount. The AI output is advisory and untrusted; recognized prompt-injection instructions trigger review. The interface exposes audit reasons and cannot treat a high similarity score as permission to pay.

## How it was built
Node.js 22, JavaScript ES modules, HTML/CSS, npm, `node:test`, `@huggingface/transformers`, the `onnx-community/all-MiniLM-L6-v2-ONNX` local embedding model, and PayPal Orders v2 REST and JavaScript SDK in Sandbox mode. The app's source tests passed **47/47** in the documented local verification. The real Sandbox payment was verified separately; automated PayPal tests use mock HTTP transport so running tests never initiates a payment.

## What makes it different
Rather than letting a language model decide when money changes hands, ProofPay combines evidence checks, inspectable explanations, advisory AI, and two independent authorizations: an explicit milestone approval and a real buyer checkout approval. The Evidence Constellation makes the state transition visible while keeping counterfactual exploration separate from payments.

## Limitations and next steps
ProofPay is a loopback-only, single-project prototype. It does not provide production login security, multiple tenant isolation, webhook infrastructure, escrow, automated settlement or verified document authenticity. The MiniLM model is English-centric and cannot inspect files or prove that work was delivered. There are no paying customers or measured reductions in disputes yet.

The next steps are stronger capture-receipt reconciliation, authenticated tenant ownership for a future hosted service, model reproducibility and richer evidence validation.

## Judge access / setup
The public open-source repository must provide complete setup instructions and a permissive license. Judges can run the app locally with `npm ci`, `npm test`, and `npm start` in simulated payment mode, or supply their own free PayPal Developer Sandbox merchant/buyer test accounts for a genuine integration test. Do not use Live credentials or real funds.

## Required URLs — verified 27 October 2026
- Public source repository (MIT): https://github.com/simo007bob-byte/proofpay-ai
- Public YouTube demo (2:15): https://www.youtube.com/watch?v=ndGIOVZBhBc
- Public Devpost competition submission (confirmed): https://devpost.com/software/proofpay-ai-evidence-first-payment-second

**Submission confirmation:** Devpost displayed "Project submitted!" and opened the public project page on 27 October 2026. The project can still be edited before the contest deadline. Publication does not establish that all independent release-gate checks have passed.
