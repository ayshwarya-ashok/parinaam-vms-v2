# database — schema source of truth

The SQL in this directory **is** the schema. TypeORM runs with `synchronize: false`; entities
mirror these files and a drift between them is a bug in the entity, not the SQL.

## Layout

```
docker-init/01_bootstrap.sh   first-boot: create n8n's DB, apply every migration (checksummed
                              into schema_migrations), load S001, then S002+ if SEED_DEMO_DATA
migrations/  V001–V017        forward-only, additive, never edited after applying
seeds/       S001–S006        idempotent — safe to re-run
```

## Migrations

| Range | What it built |
|---|---|
| V001–V009 | The designed schema: 36 tables, 8 views, 6 business functions — identity, the Program → Activity → Event hierarchy, trainings/quizzes, enrollment + waitlists, field execution, recognition, ops |
| V010 | Email attachments live on the outbox row (sweep retries keep the file) |
| V011 | Registration review (`registration_status` + reviewer columns, CHECK: a rejection needs a reason) · richer sign-up profile · **`reference_values`** catalog → 37 tables |
| V012 | Hours count **attended records only** in `v_program_participation`, `v_event_attendance`, `v_volunteer_report_summary`; the report view also drops erased volunteers |
| V013 | **Beneficiary communities** + session links (≥1 per published session, service-enforced); backfill to a seeded default |
| V014 | **Session phases**: `inprogress` event status, `event_phases` (ownership, completion marks, audited override), `fn_recompute_event_phase_status` — the only writer of a phased session's status |
| V015 | **Visit-level attendance**: `phase_id`/`visit_date` on `attendance_records`, two partial unique indexes replacing the one-per-session UNIQUE, views rewritten (DISTINCT session counts, hours stay SUMs) |
| V016 | Item-4 close-out: `certificates.memento_note`, `photo_source` gains `volunteer_feedback`, `event_photos.feedback_id` |
| V017 | BR-01 revised: `volunteers_csr_org_chk` keeps CSR→organization mandatory but lets an Individual carry one as an optional affiliation |

**Adding one:** create `V0NN__short_description.sql`; never edit an applied file (the bootstrap
records a SHA-256 per file); long index builds use `CREATE INDEX CONCURRENTLY` in their own
non-transactional migration; update `docs/03-data-model.md` in the same change. Apply to a
running stack with `MSYS_NO_PATHCONV=1 docker compose exec -T db psql -U parinaam -d
parinaam_vms -v ON_ERROR_STOP=1 -f /database/migrations/V0NN__…sql`, then insert the
`schema_migrations` row.

## Views and functions worth knowing

- `fn_is_event_enrollable(event)` — the single definition of "can anyone still join": event
  `upcoming`, activity + programme `active`, date not past (the BR-17 cascade in one call).
- `fn_promote_waitlist(event)` — locks the event, fills open seats from the queue in order.
  Fired by the cancellation trigger **and called explicitly when an admin raises capacity**.
- `fn_recompute_volunteer_phase(volunteer)` — owns Onboarding → In Training → Active.
- `fn_recompute_event_phase_status(event)` — derives a phased session's status from its
  phases (all complete → completed, any started → inprogress); sessions without phases
  keep the manual lifecycle and are never touched.
- `v_event_capacity`, `v_valid_training_passes`, `v_volunteer_compliance`,
  `v_program_participation` (the certificate source), `v_dashboard_kpis`.

## Seeds

| File | Purpose |
|---|---|
| S001 | Reference data — **every environment**, production included: app settings, feedback tag catalog, `reference_values` (languages, interests, availability) |
| S002 | The demo world: programmes, sessions in every state, volunteers at every phase, deliberate fixtures (an overlap pair for BR-11, a full session, a discontinued activity) |
| S003 | One fully-worked activity (*Lake Clean-up Drive*): completed sessions with mixed attendance sources, an upcoming session full with a live waitlist, a draft |
| S004 | Completes volunteer identity fields the mandatory-field rule requires; normalises phones to bare ten digits; **never touches erased records** |
| S005 | The four client-document scenarios (docs/08 §4): AAP Exposure Visit + Read to Rise, the 7-phase Chote Kadam mentor journey (inprogress, CSR lead, one visit), Snow City outing, two beneficiary communities |
| S006 | Four **Individual volunteers affiliated to an organization** (the V017 scenario): Kavya @ TechCorp (same company as the CSR volunteer — the contrast case), Manish + Shruti @ Infosys BPM, Farhan @ Wipro Cares. Organizations resolved **by name**, never by fixed id — the app's resolve-or-create path may have made them first |

Training-material PDFs are generated, not shipped — run `scripts/generate-seed-materials.mjs`
once after first boot (see the root README §1.6).

## Useful commands

```bash
docker compose exec db psql -U parinaam -d parinaam_vms          # psql shell
select * from schema_migrations order by version;                 # what's applied
docker compose down -v && docker compose up -d                    # rebuild from scratch
sh scripts/backup.sh ./backups                                    # dump BOTH databases (n8n too)
```

Full column-level documentation: `docs/03-data-model.md` (including the post-V009 appendix).
