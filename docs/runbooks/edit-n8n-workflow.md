# Runbook — Editing the n8n workflow safely

The repo file `n8n/workflows/vms-email-dispatch.json` is the source of truth;
the drift check (`node scripts/n8n-drift-check.mjs`) fails the moment the live
instance differs. Never leave an edit only in the n8n UI.

## Safe edit cycle
1. Edit in the n8n UI (http://localhost:5679) against the dev stack.
2. Send a test through the REAL pipeline:
   `curl -X POST localhost:3001/api/v1/internal/test-email -H "Content-Type: application/json" -d '{"to":"wf.test@example.org"}'`
   and confirm delivery in Mailpit **and** that the email_logs row reaches `sent`
   (the signed callback still works).
3. Export and commit:
   ```sh
   docker compose exec n8n n8n export:workflow --id=vmsEmailDispatch1 --output=/workflows/vms-email-dispatch.json
   git add n8n/workflows && git commit
   ```
4. `node scripts/n8n-drift-check.mjs` must pass afterwards.

## Contract you must not break
- Verify `X-VMS-Signature` (HMAC-SHA256 of the exact JSON body with
  `VMS_WEBHOOK_SECRET`) before doing anything.
- Respond to the webhook BEFORE the SMTP send (the API's `markDispatched`
  guard depends on early ack).
- Call back to `callbackUrl` with `{emailLogId, status, providerMessageId?,
  errorMessage?}`, signed the same way — without it every message is retried
  by the sweeper forever.
