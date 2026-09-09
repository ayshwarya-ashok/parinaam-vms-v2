#!/usr/bin/env node
/**
 * Authorization matrix test — asserts every endpoint against every role.
 *
 * For each route we call the live API four times (anonymous, volunteer,
 * field coordinator, admin) and assert only the AUTHORIZATION outcome:
 *   - denied  = 401 (no/бad token) or 403 (wrong role)
 *   - allowed = anything else (200/400/404/409 — the guard let us through)
 *
 * Guards run before validation pipes and handlers, so probing mutating routes
 * with empty bodies and random UUIDs is safe: a denied call never reaches the
 * handler, an allowed call fails validation (400) or lookup (404) without
 * mutating anything.
 *
 * Usage: node scripts/authz-matrix.mjs [apiBase]
 * Exits non-zero on any mismatch. Run against a dev stack, never production.
 */

const BASE = process.argv[2] ?? 'http://localhost:3001/api/v1';
const UUID = '99999999-9999-4999-8999-999999999999'; // structurally valid, never exists

// access per role: 'A' allowed, 'D' denied      anon vol field_coordinator admin
const MATRIX = [
  // ── public by design ────────────────────────────────────────────────
  ['GET',    '/health',                                 'A', 'A', 'A', 'A'],
  ['GET',    '/health/ready',                           'A', 'A', 'A', 'A'],
  ['GET',    '/metrics',                                'A', 'A', 'A', 'A'],
  ['GET',    '/public/impact',                          'A', 'A', 'A', 'A'],
  ['GET',    '/reference-values',                       'A', 'A', 'A', 'A'],
  ['GET',    '/organizations',                          'A', 'A', 'A', 'A'], // the registration form is public
  ['POST',   '/auth/check-email',                       'A', 'A', 'A', 'A'],
  ['POST',   '/auth/register',                          'A', 'A', 'A', 'A'],
  // /files/signed is @Public, but an invalid signature is 401 for EVERYONE —
  // identical treatment across roles is exactly what this row asserts.
  ['GET',    `/files/signed?path=x&exp=1&sig=x`,        'D', 'D', 'D', 'D'],
  // ── authenticated, any role ─────────────────────────────────────────
  ['GET',    '/auth/me',                                'D', 'A', 'A', 'A'],
  ['POST',   '/auth/change-password',                   'D', 'A', 'A', 'A'],
  // ── volunteer self-service ──────────────────────────────────────────
  ['GET',    '/volunteers/me',                          'D', 'A', 'D', 'D'], // admins have no volunteer profile
  ['GET',    '/volunteers/me/compliance',               'D', 'A', 'D', 'D'],
  ['GET',    '/events',                                 'D', 'A', 'A', 'A'],
  ['GET',    '/enrollments/me',                         'D', 'A', 'D', 'D'],
  ['GET',    '/trainings/me',                           'D', 'A', 'D', 'D'],
  ['GET',    '/certificates/me',                        'D', 'A', 'D', 'D'],
  ['GET',    '/feedback/me',                            'D', 'A', 'D', 'D'],
  ['GET',    '/feedback/eligible-events',               'D', 'A', 'D', 'D'],
  ['POST',   '/feedback',                               'D', 'A', 'D', 'D'],
  ['POST',   `/feedback/${UUID}/photos`,                'D', 'A', 'D', 'D'],
  ['GET',    '/feedback/options',                       'D', 'A', 'A', 'A'],
  ['GET',    '/phases/mine',                            'D', 'A', 'D', 'D'],
  ['POST',   `/phases/${UUID}/partner-complete`,        'D', 'A', 'D', 'D'],
  // ── admin only ──────────────────────────────────────────────────────
  ['GET',    '/analytics/dashboard',                    'D', 'D', 'A', 'A'],
  ['GET',    '/analytics/summary',                      'D', 'D', 'A', 'A'],
  ['GET',    '/volunteers',                             'D', 'D', 'A', 'A'],
  [`GET`,    `/volunteers/${UUID}`,                     'D', 'D', 'A', 'A'],
  ['PATCH',  `/volunteers/${UUID}`,                     'D', 'D', 'D', 'A'],
  ['POST',   `/volunteers/${UUID}/erase`,               'D', 'D', 'D', 'A'],
  ['POST',   '/volunteers/invite',                       'D', 'D', 'D', 'A'],
  ['GET',    '/volunteers/import-template',              'D', 'D', 'D', 'A'],
  ['POST',   '/volunteers/import',                       'D', 'D', 'D', 'A'],
  ['POST',   '/volunteers/admin-create',                 'D', 'D', 'D', 'A'],
  ['POST',   `/volunteers/${UUID}/welcome-back`,        'D', 'D', 'D', 'A'],
  ['POST',   `/events/${UUID}/sponsor-pack`,            'D', 'D', 'A', 'A'],
  ['PATCH',  `/volunteers/${UUID}/registration`,        'D', 'D', 'D', 'A'],
  ['POST',   `/volunteers/${UUID}/approve`,             'D', 'D', 'D', 'A'],
  ['POST',   `/volunteers/${UUID}/reject`,              'D', 'D', 'D', 'A'],
  ['GET',    `/events/${UUID}/session-record`,          'D', 'D', 'A', 'A'],
  ['POST',   `/events/${UUID}/complete`,                'D', 'D', 'A', 'A'],
  ['POST',   `/events/${UUID}/attendance`,              'D', 'D', 'A', 'A'],
  ['POST',   `/events/${UUID}/pre-session-email`,       'D', 'D', 'A', 'A'],
  ['GET',    '/coordinators',                           'D', 'D', 'D', 'A'],
  ['POST',   '/coordinators',                           'D', 'D', 'D', 'A'],
  ['GET',    '/certificates',                           'D', 'D', 'A', 'A'],
  ['POST',   '/certificates/issue',                     'D', 'D', 'A', 'A'],
  ['POST',   '/certificates/issue-bulk',                'D', 'D', 'A', 'A'],
  ['POST',   `/certificates/${UUID}/resend`,            'D', 'D', 'A', 'A'],
  ['POST',   `/certificates/${UUID}/reissue`,           'D', 'D', 'A', 'A'],
  ['GET',    '/feedback',                               'D', 'D', 'A', 'A'],
  ['GET',    '/feedback/analytics',                     'D', 'D', 'A', 'A'],
  ['PATCH',  `/feedback/${UUID}/publish`,               'D', 'D', 'A', 'A'],
  ['GET',    '/reports/volunteers',                     'D', 'D', 'D', 'A'],
  ['POST',   '/reports/export',                         'D', 'D', 'D', 'A'],
  ['GET',    '/reports/runs',                           'D', 'D', 'D', 'A'],
  ['GET',    '/reports/scheduled',                      'D', 'D', 'D', 'A'],
  ['POST',   '/reports/scheduled',                      'D', 'D', 'D', 'A'],
  ['PATCH',  `/reports/scheduled/${UUID}`,              'D', 'D', 'D', 'A'],
  ['DELETE', `/reports/scheduled/${UUID}`,              'D', 'D', 'D', 'A'],
  ['POST',   `/reports/scheduled/${UUID}/run-now`,      'D', 'D', 'D', 'A'],
  ['GET',    '/attendance/dispatches',                  'D', 'D', 'A', 'A'],
  ['GET',    '/audit-logs',                             'D', 'D', 'D', 'A'],
  ['GET',    '/communities',                            'D', 'D', 'A', 'A'],
  ['POST',   '/communities',                            'D', 'D', 'D', 'A'],
  ['GET',    `/communities/${UUID}`,                    'D', 'D', 'A', 'A'],
  ['PATCH',  `/communities/${UUID}`,                    'D', 'D', 'D', 'A'],
  ['GET',    `/communities/${UUID}/sessions`,           'D', 'D', 'A', 'A'],
  ['GET',    `/events/${UUID}/phases`,                  'D', 'D', 'A', 'A'],
  ['POST',   `/events/${UUID}/phases`,                  'D', 'D', 'D', 'A'],
  ['PATCH',  `/phases/${UUID}`,                         'D', 'D', 'D', 'A'],
  ['DELETE', `/phases/${UUID}`,                         'D', 'D', 'D', 'A'],
  ['POST',   `/phases/${UUID}/start`,                   'D', 'D', 'A', 'A'],
  ['POST',   `/phases/${UUID}/complete`,                'D', 'D', 'A', 'A'],
  ['POST',   `/phases/${UUID}/override`,                'D', 'D', 'A', 'A'],
  ['POST',   `/phases/${UUID}/visits`,                  'D', 'D', 'A', 'A'],
  ['DELETE', `/attendance/visits/${UUID}`,              'D', 'D', 'A', 'A'],
  // shared-but-authorized-inside (guard admits both roles; ownership decides)
  ['GET',    `/certificates/${UUID}/download`,          'D', 'A', 'A', 'A'],
];

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  return (await res.json()).accessToken;
}

async function probe(method, path, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method !== 'GET' ? '{}' : undefined,
  });
  return res.status;
}

const outcome = (status) => (status === 401 || status === 403 ? 'D' : 'A');

const admin = await login(process.env.ADMIN_EMAIL ?? 'admin@parinaam.org', process.env.ADMIN_PASSWORD ?? 'Parinaam@123');
const volunteer = await login(process.env.VOL_EMAIL ?? 'ananya@example.com', process.env.VOL_PASSWORD ?? 'Parinaam@123');
const coordinator = await login(process.env.FC_EMAIL ?? 'priya@parinaam.org', process.env.FC_PASSWORD ?? 'Parinaam@123');

let failures = 0;
for (const [method, path, anonExp, volExp, fcExp, admExp] of MATRIX) {
  const [anonStatus, volStatus, fcStatus, admStatus] = await Promise.all([
    probe(method, path, null),
    probe(method, path, volunteer),
    probe(method, path, coordinator),
    probe(method, path, admin),
  ]);
  const results = [
    ['anon', anonStatus, anonExp],
    ['volunteer', volStatus, volExp],
    ['coordinator', fcStatus, fcExp],
    ['admin', admStatus, admExp],
  ];
  for (const [role, status, expected] of results) {
    if (outcome(status) !== expected) {
      failures += 1;
      console.error(`FAIL ${method.padEnd(6)} ${path}  ${role}: expected ${expected === 'A' ? 'allowed' : 'denied'}, got HTTP ${status}`);
    }
  }
}

const checks = MATRIX.length * 4;
if (failures > 0) {
  console.error(`\n${failures}/${checks} authorization checks FAILED`);
  process.exit(1);
}
console.log(`authz matrix: ${checks} checks across ${MATRIX.length} endpoints × 4 roles — all passed`);
