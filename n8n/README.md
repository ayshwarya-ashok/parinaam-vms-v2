# n8n — email orchestration

Every outbound email in Parinaam VMS is delivered by n8n. The API never talks to SMTP.

> **Ports.** Inside the Docker network n8n is `n8n:5678` (that is what the API calls). On the
> **host** the ports are shifted so the legacy stack can coexist: n8n editor
> **http://localhost:5679**, Mailpit inbox **http://localhost:8026/mailpit/** (SMTP 1026).

## Why

Three reasons this is worth the extra container:

1. **Ops can change delivery without a deploy.** Adding a WhatsApp fallback for attendance
   reminders, or CC-ing a programme manager on cancellation notices, becomes a workflow edit
   rather than a release.
2. **Retry and visibility come free.** n8n keeps a full execution record for every message,
   with the payload and the error, browsable in its UI.
3. **The API stays small.** No SMTP connection pooling, no bounce parsing, no provider SDKs.

## The contract

```
NestJS API                          n8n                          SMTP
──────────                          ───                          ────
1. write email_logs row
   (status = queued, attachment
    pointer stored ON the row)
2. render Handlebars
   subject + html
3. POST /webhook/vms-email  ───▶  verify HMAC
   X-VMS-Signature: <hmac>        respond 200 (early ack)
   status = dispatched            fetch attachment (if any)
                                  send  ──────────────────────▶  Mailpit / relay
                                  build callback
4. POST /webhooks/n8n/email-status ◀── signed callback
   status = sent | failed
```

**The API renders the template, n8n delivers it.** That split is deliberate: it keeps the
guarantee that the email preview an admin sees before pressing Send is byte-identical to what
goes out. The **Respond node fires before the SMTP send** — the API's `markDispatched` guard
depends on the ack arriving before the delivery callback; do not reorder them.

### Request payload

```json
{
  "emailLogId": "uuid",
  "templateKey": "attendance_volunteer",
  "to": "ananya@example.org",
  "subject": "Action required: mark your attendance — Blood Pressure Screening",
  "html": "<!doctype html>…",
  "text": "plain text fallback",
  "fromName": "Parinaam Foundation",
  "fromEmail": "noreply@parinaam.org",
  "attachmentUrl": "http://api:3000/api/v1/files/signed?path=…&exp=…&sig=…&name=PAR-2026-000001.pdf",
  "attachmentName": "PAR-2026-000001.pdf",
  "callbackUrl": "http://api:3000/api/v1/webhooks/n8n/email-status"
}
```

Attachments travel as a **short-lived signed URL** (HMAC over path+expiry; the `name` parameter
sets the served filename that n8n names the attachment after), never as base64 — a bulk
certificate run would otherwise push megabytes through the webhook. The pointer is also stored
on the `email_logs` row itself, so an outbox-sweep retry re-sends the message *with* its file.

### Callback payload

```json
{ "emailLogId": "uuid", "status": "sent",
  "providerMessageId": "…", "n8nExecutionId": "1234", "sentAt": "…" }
```

Both directions are signed with `HMAC-SHA256(secret, JSON.stringify(body))` in
`X-VMS-Signature`, using `VMS_WEBHOOK_SECRET`. The API rejects an unsigned or mis-signed
callback — otherwise anyone who could reach the API could mark mail as delivered.

## Why the API still keeps a queue

`email_logs` is a transactional outbox. The row is written in the same transaction as the thing
that caused it (the enrollment, the cancellation), before n8n is contacted. If n8n is down, the
row sits at `queued` and a sweep retries the handoff — with a fresh BullMQ job id, because
BullMQ silently dedupes re-adds against failed jobs. Without the outbox, an n8n outage during
an event cancellation would silently drop notifications to every registrant.

## Setup

The stack starts n8n automatically (`docker compose up -d`). Then, once, **via CLI** — no UI
clicking required:

```bash
docker compose exec n8n n8n import:credentials --input=/workflows/vms-smtp.credentials.json
docker compose exec n8n n8n import:workflow --input=/workflows/vms-email-dispatch.json
docker compose exec n8n n8n publish:workflow --id=vmsEmailDispatch1
```

The credential file points SMTP at `mailpit:1025`; in production, edit the credential to the
real relay — nothing else changes. `VMS_WEBHOOK_SECRET` is injected by Compose so the Code
nodes can read it from `$env`.

> **The n8n editor asks you to sign in?** n8n v1 always has user management on (the
> `N8N_USER_MANAGEMENT_DISABLED` flag is ignored). If the owner password is unknown:
> `docker compose exec n8n n8n user-management:reset` — workflows and credentials survive, and
> the setup screen reappears for you to choose a new one.

## Keeping the live workflow honest

The repo file is the source of truth. **`node scripts/n8n-drift-check.mjs`** (from the repo
root) fails if the live workflow differs from `vms-email-dispatch.json` or is inactive — run it
after any edit, and see `docs/runbooks/edit-n8n-workflow.md` for the safe edit cycle and the
contract rules you must not break.

## Validating that mail arrives

Mailpit is the sample mailbox: it accepts everything and delivers nothing onward.

- **Inbox**: http://localhost:8026/mailpit/
- **API**: `GET http://localhost:8026/mailpit//api/v1/messages` — assertable JSON, so *"cancelling this
  occurrence produced exactly N messages"* is a real test.

Two smoke tests:

```bash
# The whole pipeline through the application (recommended):
curl -X POST http://localhost:3001/api/v1/internal/test-email \
  -H "Content-Type: application/json" -d '{"to":"smoke@example.org"}'
# → appears in Mailpit within seconds; the email_logs row reaches status "sent".

# n8n in isolation — post a signed payload straight at the webhook:
SECRET=$(grep VMS_WEBHOOK_SECRET .env | cut -d= -f2)
BODY='{"emailLogId":"00000000-0000-0000-0000-000000000000","templateKey":"smoke_test","to":"ananya@example.org","subject":"Parinaam VMS smoke test","html":"<h1>It works</h1>","fromName":"Parinaam Foundation","fromEmail":"noreply@parinaam.org","callbackUrl":"http://api:3000/api/v1/webhooks/n8n/email-status"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
curl -X POST http://localhost:5679/webhook/vms-email \
  -H "Content-Type: application/json" -H "X-VMS-Signature: $SIG" -d "$BODY"
```

## Workflows in this directory

| File | Purpose |
|---|---|
| `vms-email-dispatch.json` | The one live workflow: signature verification, early ack, optional attachment fetch, SMTP send, signed status callback |
| `vms-smtp.credentials.json` | The `VMS SMTP` credential (Mailpit locally) |

The design doc once sketched separate workflows for bulk announcements, attendance reminders
and scheduled reports. **They were deliberately not built**: all of those — the pre-session
sweep (T-7 `session_details` + T-1 `session_reminder`, daily 09:30 IST, admin re-send from
the session record), the event-driven `welcome_back` (fires on inactive → active), and the
admin-triggered `corporate_invite` and `sponsor_thank_you` — became API-side sweeps,
triggers and dispatchers that feed individual messages through this same workflow, keeping
one delivery path, one signature contract and one execution log.

## Production notes

- n8n stores its own state in a separate `n8n` database on the same Postgres server (created by
  the bootstrap script). **Back it up alongside the VMS database** — `scripts/backup.sh` does.
- Set `N8N_ENCRYPTION_KEY` to a stable value per environment. **Changing it makes stored
  credentials unreadable**, which is a very confusing outage.
- Do not expose the n8n port publicly. It should be reachable from the API container and from
  an admin over a tunnel or VPN, nothing else.
