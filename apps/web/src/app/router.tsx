import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth } from './guards';
import { AdminLogin } from '@/pages/AdminLogin';
import { Consent } from '@/pages/Consent';
import { ProfilePage } from '@/pages/Profile';
import { Register } from '@/pages/Register';
import { ConsentGate } from './consent-gate';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { ProgramsList } from '@/pages/admin/ProgramsList';
import { ProgramDetail } from '@/pages/admin/ProgramDetail';
import { ProgramForm } from '@/pages/admin/ProgramForm';
import { ActivityForm } from '@/pages/admin/ActivityForm';
import { ActivityDetail } from '@/pages/admin/ActivityDetail';
import { ScheduleEventForm } from '@/pages/admin/ScheduleEventForm';
import { VolunteerDirectory } from '@/pages/admin/VolunteerDirectory';
import { VolunteerDashboard } from '@/pages/volunteer/VolunteerDashboard';
import { BrowseSessions } from '@/pages/volunteer/BrowseSessions';
import { SessionDetailPage } from '@/pages/volunteer/SessionDetail';
import { CalendarPage } from '@/pages/volunteer/CalendarPage';
import { MyTrainings } from '@/pages/volunteer/MyTrainings';
import { TrainingView } from '@/pages/volunteer/TrainingView';
import { TrainingsList } from '@/pages/admin/TrainingsList';
import { TrainingForm } from '@/pages/admin/TrainingForm';
import { AssessmentsPage } from '@/pages/admin/AssessmentsPage';
import { FieldExecution } from '@/pages/admin/FieldExecution';
import { RecognitionHub } from '@/pages/admin/RecognitionHub';
import { CertificatesAdmin } from '@/pages/admin/CertificatesAdmin';
import { FeedbackAdmin } from '@/pages/admin/FeedbackAdmin';
import { MetricsDashboard } from '@/pages/admin/MetricsDashboard';
import { ReportsPage } from '@/pages/admin/ReportsPage';
import { ScheduledReportsPage } from '@/pages/admin/ScheduledReportsPage';
import { MyCertificates } from '@/pages/volunteer/MyCertificates';
import { FeedbackPage } from '@/pages/volunteer/FeedbackPage';
import { AttendanceFormPage } from '@/pages/public/AttendanceForm';
import { CoordinatorReportPage } from '@/pages/public/CoordinatorReport';
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
  { path: '/register', element: <Register /> },
  { path: '/admin/login', element: <AdminLogin /> },
  { path: '/impact', element: stub('Parinaam Foundation', 'Impact Report', 'Phase 8') },
  // Link-token forms — no session, standalone pages.
  { path: '/attendance/:token', element: <AttendanceFormPage /> },
  { path: '/report/:token', element: <CoordinatorReportPage /> },

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
      { path: 'dashboard', element: <VolunteerDashboard />, handle: { crumb: 'Dashboard' } },
      { path: 'events', element: <BrowseSessions />, handle: { crumb: 'Events' } },
      { path: 'events/:id', element: <SessionDetailPage />, handle: { crumb: 'Detail' } },
      { path: 'calendar', element: <CalendarPage />, handle: { crumb: 'Calendar' } },
      { path: 'consent', element: <Consent />, handle: { crumb: 'Consent' } },
      { path: 'trainings', element: <ConsentGate><MyTrainings /></ConsentGate>, handle: { crumb: 'Trainings' } },
      { path: 'trainings/:id', element: <ConsentGate><TrainingView /></ConsentGate>, handle: { crumb: 'Training' } },
      { path: 'certificates', element: <MyCertificates />, handle: { crumb: 'Certificates' } },
      { path: 'feedback', element: <FeedbackPage />, handle: { crumb: 'Feedback' } },
      { path: 'profile', element: <ProfilePage />, handle: { crumb: 'Profile' } },
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
      { path: 'dashboard', element: <AdminDashboard />, handle: { crumb: 'Dashboard' } },
      { path: 'volunteers', element: <VolunteerDirectory />, handle: { crumb: 'Volunteers' } },
      { path: 'programs', element: <ProgramsList />, handle: { crumb: 'Programs' } },
      { path: 'programs/new', element: <ProgramForm />, handle: { crumb: 'New' } },
      { path: 'programs/:id', element: <ProgramDetail />, handle: { crumb: 'Detail' } },
      { path: 'programs/:id/edit', element: <ProgramForm />, handle: { crumb: 'Edit' } },
      { path: 'programs/:programId/activities/new', element: <ActivityForm />, handle: { crumb: 'Add Activity' } },
      { path: 'activities/:id', element: <ActivityDetail />, handle: { crumb: 'Activity' } },
      { path: 'activities/:id/edit', element: <ActivityForm />, handle: { crumb: 'Edit Activity' } },
      { path: 'activities/:activityId/events/new', element: <ScheduleEventForm />, handle: { crumb: 'Schedule' } },
      { path: 'events/:id/edit', element: stub('Admin › Schedule', 'Edit Occurrence', 'Phase 2'), handle: { crumb: 'Edit Occurrence' } },
      { path: 'calendar', element: <CalendarPage />, handle: { crumb: 'Calendar' } },
      { path: 'trainings', element: <TrainingsList />, handle: { crumb: 'Trainings' } },
      { path: 'trainings/new', element: <TrainingForm />, handle: { crumb: 'New' } },
      { path: 'trainings/:id/edit', element: <TrainingForm />, handle: { crumb: 'Edit' } },
      { path: 'trainings/:id/assessments', element: <AssessmentsPage />, handle: { crumb: 'Assessments' } },
      { path: 'field-execution', element: <FieldExecution />, handle: { crumb: 'Field Execution' } },
      { path: 'recognition', element: <RecognitionHub />, handle: { crumb: 'Recognition' } },
      { path: 'recognition/certificates', element: <CertificatesAdmin />, handle: { crumb: 'Certificates' } },
      { path: 'recognition/feedback', element: <FeedbackAdmin />, handle: { crumb: 'Feedback' } },
      { path: 'metrics', element: <MetricsDashboard />, handle: { crumb: 'Metrics' } },
      { path: 'reports', element: <ReportsPage />, handle: { crumb: 'Reports' } },
      { path: 'reports/scheduled', element: <ScheduledReportsPage />, handle: { crumb: 'Automated' } },
    ],
  },

  { path: '*', element: stub('Not found', 'This page does not exist', 'any phase') },
]);
