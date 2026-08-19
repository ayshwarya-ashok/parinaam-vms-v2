import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth } from './guards';
import { AdminLogin } from '@/pages/AdminLogin';
import { Landing } from '@/pages/Landing';
import { Placeholder } from '@/pages/Placeholder';

const volunteerNav = [
  { label: 'Dashboard', to: '/app/dashboard' },
  { label: 'Events', to: '/app/events' },
  { label: 'Calendar', to: '/app/calendar' },
  { label: 'Trainings', to: '/app/trainings' },
  { label: 'Certificates', to: '/app/certificates' },
  { label: 'Feedback', to: '/app/feedback' },
  { label: 'Profile', to: '/app/profile' },
];

const adminNav = [
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Programs', to: '/admin/programs' },
  { label: 'Calendar', to: '/admin/calendar' },
  { label: 'Trainings', to: '/admin/trainings' },
  { label: 'Volunteers', to: '/admin/volunteers' },
  { label: 'Field Execution', to: '/admin/field-execution' },
  { label: 'Recognition', to: '/admin/recognition' },
  { label: 'Metrics', to: '/admin/metrics' },
  { label: 'Reports', to: '/admin/reports' },
];

const stub = (eyebrow: string, title: string, phase: string) => (
  <Placeholder eyebrow={eyebrow} title={title} phase={phase} />
);

/**
 * The full route table from docs/05-screen-inventory.md, live from Phase 0.
 * Each phase replaces its Placeholder elements with real screens; the routes,
 * layouts and breadcrumbs never move again.
 */
export const router = createBrowserRouter([
  // ── Public ──────────────────────────────────────────────────────────────────
  { path: '/', element: <Landing /> },
  { path: '/register', element: stub('Sign up', 'Volunteer Registration', 'Phase 1') },
  { path: '/admin/login', element: <AdminLogin /> },
  { path: '/impact', element: stub('Parinaam Foundation', 'Impact Report', 'Phase 8') },
  // Link-token forms — no session, standalone pages.
  {
    path: '/attendance/:token',
    element: stub('Volunteer Attendance', 'Mark Your Attendance', 'Phase 5'),
  },
  {
    path: '/report/:token',
    element: stub('Field Coordinator', 'Event Occurrence Report', 'Phase 5'),
  },

  // ── Volunteer ───────────────────────────────────────────────────────────────
  {
    path: '/app',
    element: (
      <RequireAuth role="volunteer">
        <AppLayout variant="volunteer" nav={volunteerNav} />
      </RequireAuth>
    ),
    handle: { crumb: 'Home' },
    children: [
      { path: 'dashboard', element: stub('Volunteer', 'Welcome to Parinaam', 'Phase 3'), handle: { crumb: 'Dashboard' } },
      { path: 'events', element: stub('Volunteer › Events', 'Browse Sessions', 'Phase 3'), handle: { crumb: 'Events' } },
      { path: 'events/:id', element: stub('Volunteer › Events', 'Session Detail', 'Phase 3'), handle: { crumb: 'Detail' } },
      { path: 'calendar', element: stub('Volunteer', 'Activity Calendar', 'Phase 3'), handle: { crumb: 'Calendar' } },
      { path: 'consent', element: stub('Volunteer Orientation', 'Compliance Agreement', 'Phase 1'), handle: { crumb: 'Consent' } },
      { path: 'trainings', element: stub('Volunteer', 'My Required Trainings', 'Phase 4'), handle: { crumb: 'Trainings' } },
      { path: 'trainings/:id', element: stub('My Trainings', 'Training', 'Phase 4'), handle: { crumb: 'Training' } },
      { path: 'certificates', element: stub('Volunteer', 'My Certificates', 'Phase 6'), handle: { crumb: 'Certificates' } },
      { path: 'feedback', element: stub('Volunteer', 'Share Your Experience', 'Phase 6'), handle: { crumb: 'Feedback' } },
      { path: 'profile', element: stub('Volunteer', 'My Profile', 'Phase 1'), handle: { crumb: 'Profile' } },
    ],
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  {
    path: '/admin',
    element: (
      <RequireAuth role="admin">
        <AppLayout variant="admin" nav={adminNav} />
      </RequireAuth>
    ),
    handle: { crumb: 'Admin' },
    children: [
      { path: 'dashboard', element: stub('Parinaam Admin', 'Admin Dashboard', 'Phase 2'), handle: { crumb: 'Dashboard' } },
      { path: 'volunteers', element: stub('Admin › People', 'Volunteer Directory', 'Phase 2'), handle: { crumb: 'Volunteers' } },
      { path: 'programs', element: stub('Admin › Programs', 'Programs', 'Phase 2'), handle: { crumb: 'Programs' } },
      { path: 'programs/new', element: stub('Admin › Programs', 'Add Program', 'Phase 2'), handle: { crumb: 'New' } },
      { path: 'programs/:id', element: stub('Admin › Programs', 'Program Detail', 'Phase 2'), handle: { crumb: 'Detail' } },
      { path: 'programs/:id/edit', element: stub('Admin › Programs', 'Edit Program', 'Phase 2'), handle: { crumb: 'Edit' } },
      { path: 'programs/:id/activities/new', element: stub('Admin › Programs', 'Add Activity', 'Phase 2'), handle: { crumb: 'Add Activity' } },
      { path: 'activities/:id', element: stub('Admin › Activities', 'Activity Detail', 'Phase 2'), handle: { crumb: 'Activity' } },
      { path: 'activities/:id/edit', element: stub('Admin › Activities', 'Edit Activity', 'Phase 2'), handle: { crumb: 'Edit Activity' } },
      { path: 'activities/:id/events/new', element: stub('Admin › Schedule', 'Schedule Occurrence', 'Phase 2'), handle: { crumb: 'Schedule' } },
      { path: 'events/:id/edit', element: stub('Admin › Schedule', 'Edit Occurrence', 'Phase 2'), handle: { crumb: 'Edit Occurrence' } },
      { path: 'calendar', element: stub('Admin', 'Activity Calendar', 'Phase 3'), handle: { crumb: 'Calendar' } },
      { path: 'trainings', element: stub('Admin › Trainings', 'Trainings', 'Phase 4'), handle: { crumb: 'Trainings' } },
      { path: 'trainings/new', element: stub('Admin › Trainings', 'Add Training', 'Phase 4'), handle: { crumb: 'New' } },
      { path: 'trainings/:id/edit', element: stub('Admin › Trainings', 'Edit Training', 'Phase 4'), handle: { crumb: 'Edit' } },
      { path: 'trainings/:id/assessments', element: stub('Admin › Trainings', 'Assessment Status', 'Phase 4'), handle: { crumb: 'Assessments' } },
      { path: 'field-execution', element: stub('Admin', 'Field Execution & Attendance', 'Phase 5'), handle: { crumb: 'Field Execution' } },
      { path: 'recognition', element: stub('Admin', 'Recognition & Retention', 'Phase 6'), handle: { crumb: 'Recognition' } },
      { path: 'recognition/certificates', element: stub('Admin › Recognition', 'Issue Certificates', 'Phase 6'), handle: { crumb: 'Certificates' } },
      { path: 'recognition/feedback', element: stub('Admin › Recognition', 'Volunteer Feedback', 'Phase 6'), handle: { crumb: 'Feedback' } },
      { path: 'metrics', element: stub('Admin', 'Metrics Dashboard', 'Phase 7'), handle: { crumb: 'Metrics' } },
      { path: 'reports', element: stub('Admin', 'Reports', 'Phase 7'), handle: { crumb: 'Reports' } },
      { path: 'reports/scheduled', element: stub('Admin › Reports', 'Automated Reports', 'Phase 7'), handle: { crumb: 'Automated' } },
    ],
  },

  { path: '*', element: stub('Not found', 'This page does not exist', 'any phase') },
]);
