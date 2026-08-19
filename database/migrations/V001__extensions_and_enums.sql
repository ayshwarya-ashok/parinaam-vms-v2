-- =============================================================================
-- V001  Extensions, enum types, shared helper functions
-- Parinaam VMS v2 — PostgreSQL 16
--
-- Hierarchy note: Program (undated) -> Activity (undated) -> Event (dated
-- occurrence). Volunteers enroll in Events. See docs/03-data-model.md.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email columns
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- range indexes for conflict detection

-- -----------------------------------------------------------------------------
-- Identity & people
-- -----------------------------------------------------------------------------
CREATE TYPE user_role          AS ENUM ('admin', 'volunteer');
CREATE TYPE gender_type        AS ENUM ('Female', 'Male', 'Non-binary', 'Prefer not to say');
CREATE TYPE volunteer_category AS ENUM ('Individual', 'CSR');
CREATE TYPE volunteer_phase    AS ENUM ('Onboarding', 'In Training', 'Active', 'Inactive');

-- -----------------------------------------------------------------------------
-- Program / Activity / Event
-- -----------------------------------------------------------------------------
-- A Program is a long-running initiative. It is not date bound.
CREATE TYPE program_status  AS ENUM ('draft', 'active', 'discontinued');
-- An Activity is a repeatable unit of work inside a Program. Not date bound.
CREATE TYPE activity_status AS ENUM ('active', 'discontinued');
CREATE TYPE activity_type   AS ENUM ('In person', 'Online');
-- An Event is a single dated, timed occurrence of an Activity.
CREATE TYPE event_status    AS ENUM ('draft', 'upcoming', 'completed', 'cancelled');

-- -----------------------------------------------------------------------------
-- Trainings
-- -----------------------------------------------------------------------------
CREATE TYPE training_mode      AS ENUM ('Online', 'In person');
CREATE TYPE training_category  AS ENUM ('compliance', 'activity');
CREATE TYPE training_status    AS ENUM ('active', 'inactive');
CREATE TYPE material_file_type AS ENUM ('pdf', 'ppt', 'doc', 'vid');

-- -----------------------------------------------------------------------------
-- Enrollment
-- Deviation D-07: waitlist state is held exclusively in waitlist_entries.
-- Decision (2026-08-18): volunteers enroll per Event occurrence. There is no
-- separate program-level registration table.
-- -----------------------------------------------------------------------------
CREATE TYPE enrollment_status AS ENUM ('enrolled', 'cancelled');

-- -----------------------------------------------------------------------------
-- Field execution & attendance
-- -----------------------------------------------------------------------------
CREATE TYPE attendance_source AS ENUM ('self', 'coordinator', 'admin');
CREATE TYPE absence_reason AS ENUM (
  'Personal emergency',
  'Medical / Health issue',
  'Work / prior commitment',
  'Transport issue',
  'No longer available',
  'Other'
);
CREATE TYPE event_report_status AS ENUM ('completed', 'partial', 'postponed', 'cancelled');
CREATE TYPE photo_source AS ENUM ('admin_upload', 'coordinator_report', 'volunteer_attendance');

-- -----------------------------------------------------------------------------
-- Communication
-- email_status flow:  queued -> dispatched (handed to n8n) -> sent | failed | bounced
-- -----------------------------------------------------------------------------
CREATE TYPE email_recipient_type AS ENUM ('volunteer', 'coordinator', 'admin', 'bulk');
CREATE TYPE email_status         AS ENUM ('queued', 'dispatched', 'sent', 'failed', 'bounced');
CREATE TYPE access_token_purpose AS ENUM (
  'volunteer_attendance',
  'coordinator_report',
  'feedback',
  'password_reset',
  'email_verification'
);

-- -----------------------------------------------------------------------------
-- Recognition & feedback
-- Decision (2026-08-18): certificates are issued per Program; feedback is
-- submitted per Event occurrence.
-- -----------------------------------------------------------------------------
CREATE TYPE cert_type      AS ENUM ('individual', 'corporate');
CREATE TYPE vol_again_type AS ENUM ('Definitely', 'Probably', 'Not sure', 'Unlikely');

-- -----------------------------------------------------------------------------
-- Reporting
-- -----------------------------------------------------------------------------
CREATE TYPE report_format     AS ENUM ('PDF', 'Excel', 'CSV');
CREATE TYPE report_frequency  AS ENUM ('Daily', 'Weekly', 'Monthly');
CREATE TYPE report_run_status AS ENUM ('pending', 'running', 'success', 'failed');

-- -----------------------------------------------------------------------------
-- Shared trigger function: maintain updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
  'Generic BEFORE UPDATE trigger that stamps updated_at with the transaction time.';
