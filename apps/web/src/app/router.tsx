import { Suspense, lazy } from 'react';
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
import { EditEventForm } from '@/pages/admin/EditEventForm';
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
import { SessionRecord } from '@/pages/admin/SessionRecord';
import { RecognitionHub } from '@/pages/admin/RecognitionHub';
import { CertificatesAdmin } from '@/pages/admin/CertificatesAdmin';
import { FeedbackAdmin } from '@/pages/admin/FeedbackAdmin';
const MetricsDashboard = lazy(() =>
  import('@/pages/admin/MetricsDashboard').then((m) => ({ default: m.MetricsDashboard })),
);
import { ReportsPage } from '@/pages/admin/ReportsPage';
import { ScheduledReportsPage } from '@/pages/admin/ScheduledReportsPage';
import { MyCertificates } from '@/pages/volunteer/MyCertificates';
import { FeedbackPage } from '@/pages/volunteer/FeedbackPage';
import { AttendanceFormPage } from '@/pages/public/AttendanceForm';
import { CoordinatorReportPage } from '@/pages/public/CoordinatorReport';
import { Landing } from '@/pages/Landing';
import { ImpactPage } from '@/pages/public/ImpactPage';
import { NotFound } from '@/pages/NotFound';

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

/**
 * The full route table from docs/05-screen-inventory.md. Routes,
 * layouts and breadcrumbs never move again.
 */
export const router = createBrowserRouter([
  // ── Public ──────────────────────────────────────────────────────────────────
  // The front door is the public impact page; the sign-in card lives one
  // click away at /login. /impact stays valid so shared links keep working.
  { path: '/', element: <ImpactPage /> },
  { path: '/login', element: <Landing /> },
  { path: '/register', element: <Register /> },
  { path: '/admin/login', element: <AdminLogin /> },
  { path: '/impact', element: <ImpactPage /> },
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
      {
        path: 'events',
        handle: { crumb: 'Events' },
        children: [
          { index: true, element: <BrowseSessions /> },
          { path: ':id', element: <SessionDetailPage />, handle: { crumb: 'Session' } },
        ],
      },
      { path: 'calendar', element: <CalendarPage />, handle: { crumb: 'Calendar' } },
      { path: 'consent', element: <Consent />, handle: { crumb: 'Consent' } },
      {
        path: 'trainings',
        handle: { crumb: 'My Trainings' },
        children: [
          { index: true, element: <ConsentGate><MyTrainings /></ConsentGate> },
          { path: ':id', element: <ConsentGate><TrainingView /></ConsentGate>, handle: { crumb: 'Training' } },
        ],
      },
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
      {
        path: 'programs',
        handle: { crumb: 'Programs' },
        children: [
          { index: true, element: <ProgramsList /> },
          { path: 'new', element: <ProgramForm />, handle: { crumb: 'New' } },
          { path: ':id', element: <ProgramDetail />, handle: { crumb: 'Program' } },
          { path: ':id/edit', element: <ProgramForm />, handle: { crumb: 'Edit' } },
          { path: ':programId/activities/new', element: <ActivityForm />, handle: { crumb: 'Add Activity' } },
        ],
      },
      { path: 'activities/:id', element: <ActivityDetail />, handle: { crumb: 'Activity' } },
      { path: 'activities/:id/edit', element: <ActivityForm />, handle: { crumb: 'Edit Activity' } },
      { path: 'activities/:activityId/events/new', element: <ScheduleEventForm />, handle: { crumb: 'Schedule' } },
      { path: 'events/:id/edit', element: <EditEventForm />, handle: { crumb: 'Edit Occurrence' } },
      { path: 'calendar', element: <CalendarPage />, handle: { crumb: 'Calendar' } },
      {
        path: 'trainings',
        handle: { crumb: 'Trainings' },
        children: [
          { index: true, element: <TrainingsList /> },
          { path: 'new', element: <TrainingForm />, handle: { crumb: 'New' } },
          { path: ':id/edit', element: <TrainingForm />, handle: { crumb: 'Edit' } },
          { path: ':id/assessments', element: <AssessmentsPage />, handle: { crumb: 'Assessments' } },
        ],
      },
      {
        path: 'field-execution',
        handle: { crumb: 'Field Execution' },
        children: [
          { index: true, element: <FieldExecution /> },
        ],
      },
      { path: 'sessions/:id', element: <SessionRecord />, handle: { crumb: 'Session record' } },
      {
        path: 'recognition',
        handle: { crumb: 'Recognition' },
        children: [
          { index: true, element: <RecognitionHub /> },
          { path: 'certificates', element: <CertificatesAdmin />, handle: { crumb: 'Certificates' } },
          { path: 'feedback', element: <FeedbackAdmin />, handle: { crumb: 'Feedback' } },
        ],
      },
      { path: 'metrics', element: <Suspense fallback={null}><MetricsDashboard /></Suspense>, handle: { crumb: 'Metrics' } },
      {
        path: 'reports',
        handle: { crumb: 'Reports' },
        children: [
          { index: true, element: <ReportsPage /> },
          { path: 'scheduled', element: <ScheduledReportsPage />, handle: { crumb: 'Automated' } },
        ],
      },
    ],
  },

  { path: '*', element: <NotFound /> },
]);
