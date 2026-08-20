# Runbook — Backup & Restore

Backups cover **both** databases — the VMS and n8n's own state (workflows,
credentials, execution log). Restoring one without the other leaves either the
data or the email delivery dead.

## Take a backup
```sh
sh scripts/backup.sh ./backups
```
Produces `backups/<stamp>/{parinaam_vms.dump,n8n.dump,uploads.tar.gz,SHA256SUMS}`.
Schedule it nightly (Task Scheduler / cron) and copy the directory off the host.

## Rehearse a restore (do this monthly — a backup you have never restored is a hope, not a backup)
```sh
sh scripts/restore.sh backups/<stamp> _rehearsal
docker compose exec -T db psql -U parinaam -d parinaam_vms_rehearsal -c "SELECT COUNT(*) FROM volunteers"
docker compose exec -T db psql -U parinaam -d postgres \
  -c "DROP DATABASE parinaam_vms_rehearsal WITH (FORCE)" -c "DROP DATABASE n8n_rehearsal WITH (FORCE)"
```

## Restore for real
```sh
docker compose stop api worker n8n
sh scripts/restore.sh backups/<stamp>      # no suffix = overwrites live DBs after a 5 s grace
docker compose start n8n api worker
```
Checksums are verified before anything is touched; a mismatch aborts.

## Recorded rehearsal
2026-08-20, demo-scale data: backup **1.8 s**, restore of both databases
**8.7 s**, contents verified (37 tables, 17 volunteers, 2 issued certificates,
1 n8n workflow). Re-record here after each rehearsal.
