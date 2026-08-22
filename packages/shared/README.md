# packages/shared — contract types (reference)

Honest status: **neither app imports this package yet.** The API's `BusinessException`
catalog and the web app's `api/` types grew in place during the build phases, so this
package is a synced *reference* of the contract rather than its runtime source.

What it holds (`src/index.ts`):

- `BUSINESS_ERROR_CODES` / `BusinessErrorCode` — every stable code the API throws and the
  UI branches on (~50, grouped by domain). Kept in sync with
  `grep -r "new BusinessException(" apps/api/src`.
- Status string unions: `ProgramStatus`, `ActivityStatus`, `EventStatus`,
  `VolunteerPhase`, `RegistrationStatus`.

House rule: **when you add a business error code to the API, add it here in the same
change.** The list is the cheapest possible cross-check that a code the web branches on
actually exists — and if the apps are ever refactored to import their contract types, this
package is the ready-made home.
