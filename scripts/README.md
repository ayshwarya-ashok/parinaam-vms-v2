# scripts — operational tooling

Run everything from the **repo root**. All four are safe on Windows Git Bash — they set
`MSYS_NO_PATHCONV` themselves where container paths are involved.

| Script | What it does | When |
|---|---|---|
| `backup.sh [dir]` | `pg_dump` of **both** databases — the VMS *and* n8n's own state (workflows, credentials, execution log) — plus the uploads tree, with a `SHA256SUMS` manifest | Nightly, and before anything risky |
| `restore.sh <backup-dir> [suffix]` | Restore both dumps. With a suffix (e.g. `_rehearsal`) it restores into scratch databases — the safe way to prove a backup is restorable. Without one it overwrites the live databases after a 5-second grace; checksums are verified first and a mismatch aborts | Rehearse monthly (recorded: 1.8 s backup / 8.7 s restore at demo scale — see `docs/runbooks/restore.md`) |
| `n8n-drift-check.mjs` | Exports the live workflow and compares its semantic parts (nodes, parameters, connections) against `n8n/workflows/vms-email-dispatch.json`; fails on drift **or if the workflow is inactive** | After any n8n edit; in every deploy checklist |
| `generate-seed-materials.mjs` | Renders a real PDF for each seeded training material (pdf-lib, per-document content) and points the DB rows at them — otherwise every "Open" click 404s on a fresh install. Idempotent. Runs **inside the api container**: `docker compose cp scripts/generate-seed-materials.mjs api:/app/gen.mjs && docker compose exec -T api sh -c "node /app/gen.mjs && rm /app/gen.mjs"` | Once after first boot |

One more lives with the API because it asserts against it:
**`apps/api/scripts/authz-matrix.mjs`** — 53 endpoints × 3 roles (anonymous / volunteer /
admin) probed against the **live** API; denials must be 401/403, everything else counts as
"the guard let us through". Run it after adding or changing any route, and add the new route to
its table. `node apps/api/scripts/authz-matrix.mjs [apiBase]` — never against production.
