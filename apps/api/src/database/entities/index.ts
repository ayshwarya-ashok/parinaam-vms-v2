import {
  AccessToken,
  AuditLog,
  RefreshToken,
  User,
} from './identity.entity';
import {
  Coordinator,
  Organization,
  Volunteer,
  VolunteerConsent,
} from './people.entity';
import {
  Activity,
  Announcement,
  EventOccurrence,
  Program,
} from './program.entity';
import {
  ActivityTraining,
  ProgramTraining,
  Training,
  TrainingAttempt,
  TrainingAttemptAnswer,
  TrainingAttemptReset,
  TrainingMaterial,
  TrainingOption,
  TrainingQuestion,
} from './training.entity';
import { EventEnrollment, WaitlistEntry } from './enrollment.entity';
import {
  AttendanceDispatch,
  AttendanceRecord,
  EventPhoto,
  EventReport,
} from './field.entity';
import {
  Certificate,
  FeedbackImprovement,
  FeedbackIssue,
  FeedbackOption,
  FeedbackSubmission,
} from './recognition.entity';
import {
  AppSetting,
  EmailLog,
  ReportRun,
  ScheduledReport,
} from './ops.entity';

export * from './identity.entity';
export * from './people.entity';
export * from './program.entity';
export * from './training.entity';
export * from './enrollment.entity';
export * from './field.entity';
export * from './recognition.entity';
export * from './ops.entity';

/**
 * Every entity, in one array. Registered on the TypeORM data source and
 * asserted against the SQL schema by the CI drift check.
 *
 * 36 tables — see docs/03-data-model.md.
 */
export const ALL_ENTITIES = [
  // identity
  User,
  RefreshToken,
  AccessToken,
  AuditLog,
  // people
  Organization,
  Volunteer,
  Coordinator,
  VolunteerConsent,
  // hierarchy
  Program,
  Activity,
  EventOccurrence,
  Announcement,
  // training
  Training,
  TrainingMaterial,
  TrainingQuestion,
  TrainingOption,
  ProgramTraining,
  ActivityTraining,
  TrainingAttempt,
  TrainingAttemptAnswer,
  TrainingAttemptReset,
  // scheduling
  EventEnrollment,
  WaitlistEntry,
  // field
  AttendanceDispatch,
  AttendanceRecord,
  EventReport,
  EventPhoto,
  // recognition
  Certificate,
  FeedbackOption,
  FeedbackSubmission,
  FeedbackIssue,
  FeedbackImprovement,
  // ops
  EmailLog,
  ScheduledReport,
  ReportRun,
  AppSetting,
];
