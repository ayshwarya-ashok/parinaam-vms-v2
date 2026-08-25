# apps/web — React 18 + MUI SPA

Vite dev server in Docker (`:5174`), hot-reloading from the bind-mounted source. Every route is
a real screen — the last stub was removed in the post-MVP rounds.

## Layout

```
public/               parinaam-logo(.svg|-dark.svg|.png|-dark.png), favicon.svg — one source mark
src/
  main.tsx            entry; Providers wrap theme, query client, snackbars, auth, error boundary
  theme/              the design tokens (ink/accent/mint/cream) lifted from the prototype —
                      NOTE: sx numeric borderRadius MULTIPLIES shape.borderRadius (3)
  api/                typed hooks per domain (client.ts holds the axios instance +
                      silent-refresh interceptor; link.ts is the bare client for token forms)
  app/
    auth.tsx          session context: login / register (atomic) / logout / refresh
    guards.tsx        RequireAuth — role-aware route gate
    router.tsx        the full route table; nested children drive the breadcrumbs
    breadcrumbs.tsx   useDynamicCrumbs — inject parents that aren't in the URL
    toast.ts          useToast: success / failure / noChanges — the three outcomes
    validation.ts     validateProfile, phoneError/phoneForApi — shared form rules
    layouts/          AppLayout: app bar (hamburger below the breakpoint), sticky crumbs
  components/         PageShell, FilterBar, StatusPill, StatTile, SortableTable, ConfirmDialog…
  pages/
    admin/            directory (bulk invites, welcome-back re-send), programs tree,
                      communities, trainings, field execution, session record (phases
                      panel, visit log, pre-session email re-send, sponsor pack),
                      recognition (memento note at issue), metrics (lazy-loaded — the
                      only chart.js consumer), reports (annual calendar export)
    volunteer/        dashboard (incl. phase-lead responsibilities), browse/enroll with
                      Upcoming | Completed views, session detail (phase board + partner-lead
                      marking), calendar, trainings, certificates, feedback (with
                      photo upload — EXIF stripped server-side)
    public/           impact page (the site root), tokenized attendance/report forms
```

## Conventions that are load-bearing

- **Navigation back = breadcrumbs**, never "← Back" buttons. Parent links come from route
  nesting; pages whose parent isn't in the URL call `useDynamicCrumbs`.
- **Toasts through `useToast()` only** — top-right, dismissable, and *"No changes to save"*
  (neutral grey) is a real outcome: guard saves with `isUnchanged(form, original)`.
- **Errors**: surface the API's message — it carries a stable `code` and human copy written for
  the reader. Don't paraphrase specific errors into vague ones.
- **Validation lives in `app/validation.ts`** and is shared by every form that asks the same
  question (profile fields, the 10-digit phone). The API enforces everything again.
- **Tables sort via `useTableSort` + `SortableCell`** — three states; sorting is client-side
  over the rows on screen, which is the honest scope on server-paginated tables.
- **Dates for display or "today" logic use the local wall clock** — never
  `toISOString().slice(0,10)`, which is UTC and off by one until 05:30 IST.
- **Authenticated file downloads** fetch a blob through the api client and read the filename
  from `Content-Disposition`; a plain `<a href>` carries no bearer token, and `window.open` on
  a blob names the file after a GUID.
- **The public pages use a bare axios client** (`api/link.ts` or inline) so no auth interceptor
  fires on unauthenticated surfaces.

## Day-to-day

```bash
docker compose exec web npx tsc --noEmit     # typecheck (no test runner is wired here)
docker compose logs web --tail 20            # vite output / HMR errors
```

The visual language (tokens, radii, pill buttons) is the prototype's — see
`docs/01-design-document.md` §8. UI conventions established post-MVP are listed at the end of
`docs/07-post-mvp-refinements.md`.
