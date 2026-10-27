# ProofPay Release Gates

All gates must be checked by a human operator before the repository, the video or the Devpost entry is made public. This checklist does not deploy, publish, create PayPal orders or capture payments. Run every command from the repository root.

## 1. No live money
- [ ] Running `grep -rnE 'api(-m)?\.paypal\.com' src web` returns nothing (only sandbox hosts are allowed).
- [ ] The PayPal JS SDK is loaded with a Sandbox client ID only, and only after Human approval.
- [ ] Amounts are fixed on the server. The browser cannot change the amount or the currency.

## 2. Redacted secrets
- [ ] Running `git ls-files | grep -E '(^|/)\.env'` returns nothing.
- [ ] Running `grep -rnE 'PAYPAL_CLIENT_SECRET\s*=' --exclude-dir=node_modules .` returns nothing.
- [ ] Logs, screenshots and video frames show no tokens, secrets, SSH keys or private SKYNET paths.
- [ ] Any Sandbox secret that was ever exposed has been rotated.

## 3. Webhook authenticity and Idempotency
- [ ] Current status: webhooks are not implemented. The README states this.
- [ ] If webhooks are added, every event is verified with the PayPal verify-webhook-signature API using the Sandbox webhook ID before it is used.
- [ ] Duplicate events are ignored by event ID, and order creation and capture send PayPal idempotency identifiers.
- [ ] Fulfillment never trusts a browser callback alone.

## 4. CSRF and Session isolation
- [ ] Current status: local demo only, with no login, session separation or CSRF hardening. The server binds to 127.0.0.1.
- [ ] Before any internet exposure: state-changing requests use same-origin checks or CSRF tokens.
- [ ] Before any internet exposure: approval state is isolated per session, so one visitor can never approve another visitor's milestone.

## 5. Public judge access
- [ ] The preferred path is for judges to run the app locally using the README steps (npm ci, npm test, npm start).
- [ ] GET / and GET /mission-control both render on a clean checkout.
- [ ] If a hosted demo is ever offered, it runs in Sandbox only, behind TLS, with rate limiting, and only after gates 3 and 4 have passed.

## 6. OSS license
- [ ] A LICENSE file (MIT) is present at the repository root.
- [ ] Third-party licenses have been reviewed with `npm ls --all`. @huggingface/transformers and the MiniLM ONNX model are Apache-2.0.
- [ ] No private SKYNET data, merchant data or internal handoff secrets are in the tree.

## 7. YouTube
- [ ] The video is under 3 minutes and follows docs/JUDGE_DEMO_PLAYBOOK.md.
- [ ] The video shows PayPal Sandbox as NOT CONFIGURED unless a real Sandbox capture was recorded.
- [ ] The video contains no credentials and no claims about prizes, revenue or customers.

## 8. Submission evidence
- [ ] Save the commit hash and the full npm test output.
- [ ] Record the Sandbox order IDs for creation and capture, or the explicit note: Sandbox outstanding.
- [ ] Keep redacted screenshots of both demo routes.

## 9. Operator review
- [ ] A human operator has reviewed the diff, the README status and every gate above.
- [ ] The operator alone performs any publishing, pushing or submission.
- [ ] Sign-off is recorded with reviewer, date and commit hash.
