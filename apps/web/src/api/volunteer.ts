import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, asApiError } from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  code: string;
  name: string;
  date: string;
  startTime: string;
  durationHours: string;
  location: string | null;
  city: string | null;
  type: 'In person' | 'Online';
  skillRequired: string | null;
  status: 'draft' | 'upcoming' | 'inprogress' | 'completed' | 'cancelled';
  program: { id: string; name: string };
  activity: { id: string; name: string };
  coordinatorName: string;
  capacity: { enrolled: number; maxSlots: number; spotsLeft: number; waitlisted: number };
  isEnrollable: boolean;
  prereqsMet: boolean | null;
  myState: 'enrolled' | 'waitlisted' | 'none';
  waitlistPosition: number | null;
  myAttendance: 'present' | 'absent' | null;
  myHours: number | null;
  conflict: { name: string; startTime: string } | null;
}

export interface SessionDetail extends SessionRow {
  trainings: Array<{
    id: string;
    code: string;
    name: string;
    duration: string;
    mode: string;
    is_mandatory: boolean;
    source: 'program' | 'activity';
    held: boolean;
  }>;
  coordinator: { name: string; email: string; mobile: string | null };
  roster: Array<{ firstName: string; skills: string | null }>;
}

export interface MyEnrollments {
  enrollments: Array<{
    id: string;
    event_id: string;
    event_name: string;
    code: string;
    date: string;
    start_time: string;
    duration_hours: string;
    location: string | null;
    event_status: string;
    program_name: string;
    promoted_from_waitlist: boolean;
  }>;
  waitlists: Array<{
    event_id: string;
    position: number;
    event_name: string;
    date: string;
    start_time: string;
    program_name: string;
  }>;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const useSessions = (params: Record<string, string | undefined>) =>
  useQuery({
    queryKey: ['sessions', params],
    queryFn: async () =>
      (await api.get<{ data: SessionRow[] }>('/events', { params })).data.data,
  });

export const useSession = (id: string | undefined) =>
  useQuery({
    queryKey: ['session', id],
    queryFn: async () => (await api.get<SessionDetail>(`/events/${id}`)).data,
    enabled: !!id,
  });

export const useMyEnrollments = () =>
  useQuery({
    queryKey: ['my-enrollments'],
    queryFn: async () => (await api.get<MyEnrollments>('/enrollments/me')).data,
  });

export const useCalendar = (month: string) =>
  useQuery({
    queryKey: ['calendar', month],
    queryFn: async () =>
      (
        await api.get<{ byDate: Record<string, SessionRow[]>; conflictDays: string[] }>(
          '/events/calendar',
          { params: { month } },
        )
      ).data,
  });

// ── Enrollment actions with the modal-driving error contract ────────────────

export interface EnrollBlock {
  kind: 'conflict' | 'full' | 'prerequisites';
  conflict?: { name: string; startTime: string };
  waitlistPosition?: number;
  maxSlots?: number;
  missingTrainings?: Array<{ code: string; name: string; isMandatory: boolean }>;
}

/** Maps the API's stable error codes onto the modal the UI should open. */
export function toEnrollBlock(err: unknown): EnrollBlock | null {
  const apiErr = asApiError(err);
  if (!apiErr) return null;
  const details = (apiErr.details ?? {}) as Record<string, never>;
  switch (apiErr.code) {
    case 'SCHEDULING_CONFLICT':
      return { kind: 'conflict', conflict: details['conflictingEvent'] };
    case 'ACTIVITY_FULL':
      return {
        kind: 'full',
        waitlistPosition: details['waitlistPosition'],
        maxSlots: details['maxSlots'],
      };
    case 'PREREQUISITES_NOT_MET':
      return { kind: 'prerequisites', missingTrainings: details['missingTrainings'] };
    default:
      return null;
  }
}

export function useEnrollmentInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['sessions'] });
    void qc.invalidateQueries({ queryKey: ['session'] });
    void qc.invalidateQueries({ queryKey: ['my-enrollments'] });
    void qc.invalidateQueries({ queryKey: ['calendar'] });
  };
}

export function useEnroll() {
  const invalidate = useEnrollmentInvalidation();
  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      acknowledgeConflict?: boolean;
      acceptWaitlist?: boolean;
    }) =>
      (
        await api.post<{ state: 'enrolled' | 'waitlisted'; waitlistPosition?: number }>(
          `/events/${input.eventId}/enroll`,
          {
            acknowledgeConflict: input.acknowledgeConflict,
            acceptWaitlist: input.acceptWaitlist,
          },
        )
      ).data,
    onSuccess: invalidate,
  });
}

export function useWithdraw() {
  const invalidate = useEnrollmentInvalidation();
  return useMutation({
    mutationFn: async (eventId: string) =>
      (await api.delete<{ promoted: number }>(`/events/${eventId}/enroll`)).data,
    onSuccess: invalidate,
  });
}

export function useLeaveWaitlist() {
  const invalidate = useEnrollmentInvalidation();
  return useMutation({
    mutationFn: async (eventId: string) =>
      (await api.delete(`/events/${eventId}/waitlist`)).data,
    onSuccess: invalidate,
  });
}
