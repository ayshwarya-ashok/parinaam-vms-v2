# n8n — email orchestration

Every outbound email in Parinaam VMS is delivered by n8n. The API never talks to SMTP.

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
   (status = queued)
2. render Handlebars
   subject + html
3. POST /webhook/vms-email  ───▶  verify HMAC
   X-VMS-Signature: <hmac>        fetch attachment (if any)
   status = dispatched            send  ──────────────────────▶  Mailpit / relay
                                  build callback
4. POST /webhooks/n8n/email-status ◀── signed callback
   status = sent | failed
```

**The API renders the template, n8n delivers it.** That split is deliberate: it keeps the
guarantee that the email preview an admin sees before pressing Send is byte-identical to what
goes out. If you later want Parinaam staff to edit copy directly in n8n, move the Handlebars
render into the workflow and have the preview endpoint call n8n to render — but you give up the
preview guarantee, so decide consciously.

### Request payload

```json
{
  "emailLogId": "uuid",
  "templateKey": "attendance_volunteer",
  "to": "ananya@example.org",
  "subject": "Action Required: Mark Your Attendance — Blood Pressure Screening",
  "html": "<!doctype html>…",
  "text": "plain text fallback",
  "fromName": "Parinaam Foundation",
  "fromEmail": "noreply@parinaam.org",
  "attachmentUrl": "https://api/files/…?sig=…",
  "attachmentName": "certificate.pdf",
  "callbackUrl": "http://api:3000/api/v1/webhooks/n8n/email-status"
}
```

Attachments are passed as a **short-lived signed URL**, never as base64 in the body. A bulk
certificate run would otherwise push megabytes through the webhook.

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
row sits at `queued` and a sweep retries the handoff. Without it, an n8n outage during an event
cancellation would silently drop notifications to every registrant.

## Setup

The stack starts n8n automatically:

```bash
docker compose up -d
```

Then, once:

1. Open http://localhost:5678 and create the owner account (local only; set
   `N8N_USER_MANAGEMENT_DISABLED=true` in `.env` to skip).
2. **Import** `n8n/workflows/vms-email-dispatch.json` — *Workflows → ⋯ → Import from File*.
3. **Create the SMTP credential** named exactly `VMS SMTP`:
   - Host `mailpit`, Port `1025`, SSL/TLS **off**, user and password blank.
   - In production, point this at the real relay. Nothing else changes.
4. **Activate** the workflow. Its production URL becomes
   `http://n8n:5678/webhook/vms-email` (this is what the API calls from inside the network).

`VMS_WEBHOOK_SECRET` is injected into n8n by Compose, so the Code nodes can read it from
`$env` without you configuring anything.

## Validating that mail arrives

Mailpit is the sample mailbox. It accepts everything and delivers nothing onward, so you can
exercise the real send path without mailing actual volunteers.

- **Inbox**: http://localhost:8025
- **API**: `GET http://localhost:8025/api/v1/messages` — used by the e2e tests to assert that a
  cancellation actually produced one message per registrant.

End-to-end smoke test, no application code required:

```bash
# 1. Render nothing, just prove the pipeline: post a signed payload straight to n8n.
SECRET=$(grep VMS_WEBHOOK_SECRET .env | cut -d= -f2)
BODY='{"emailLogId":"00000000-0000-0000-0000-000000000000","templateKey":"smoke_test","to":"ananya@example.org","subject":"Parinaam VMS smoke test","html":"<h1>It works</h1><p>Delivered through n8n.</p>","fromName":"Parinaam Foundation","fromEmail":"noreply@parinaam.org","callbackUrl":"http://api:3000/api/v1/webhooks/n8n/email-status"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -X POST http://localhost:5678/webhook/vms-email \
  -H "Content-Type: application/json" \
  -H "X-VMS-Signature: $SIG" \
  -d "$BODY"

# 2. Open http://localhost:8025 — the message is there.
```

The callback will fail until the API exists (Phase 0); the send itself still succeeds, which is
what this test is checking.

## Workflows

| File | Purpose | Phase |
|---|---|---|
| `vms-email-dispatch.json` | Single-message send with signature verification, optional attachment, and status callback | P0 |
| `vms-bulk-announcement.json` | Fan-out for announcements and cancellations, with per-provider rate limiting | P2 |
| `vms-attendance-reminder.json` | Scheduled nudge for unsubmitted attendance forms | P5 |
| `vms-scheduled-report.json` | Report generation trigger and delivery | P7 |

Only the first ships now; the rest are created in the phase named. Export any workflow you
change back into this directory — these files are version-controlled deliberately, so a
rebuilt n8n instance is reproducible.

## Production notes

- n8n stores its own state in a separate `n8n` database on the same Postgres server. It is
  created by the database bootstrap script.
- Set `N8N_ENCRYPTION_KEY` to a stable value per environment. **Changing it makes stored
  credentials unreadable**, which is a very confusing outage.
- Do not expose port 5678 publicly. n8n should be reachable from the API container and from an
  admin over a tunnel or VPN, nothing else.
- Set `N8N_BASIC_AUTH_ACTIVE=true` (or configure real user management) before any deployment
  that is not a laptop.
