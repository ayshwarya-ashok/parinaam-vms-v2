import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// ── Types the admin screens share ─────────────────────────────────────────────

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'discontinued';
  defaultCoordinator: { id: string; name: string } | null;
  activeActivities: number;
  upcomingEvents: number;
  completedEvents: number;
  nextEventDate: string | null;
}

export interface ActivityRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'In person' | 'Online';
  skill_required: string | null;
  default_duration_hours: string | null;
  default_max_slots: number | null;
  default_location: string | null;
  status: 'active' | 'discontinued';
  discontinue_reason: string | null;
  upcoming_events: number;
  completed_events: number;
}

export interface ProgramDetail
  extends Omit<ProgramRow, 'activeActivities' | 'upcomingEvents' | 'completedEvents' | 'nextEventDate'> {
  discontinueReason: string | null;
  activities: ActivityRow[];
  trainings: TrainingRef[];
}

export interface TrainingRef {
  id: string;
  code: string | null;
  name: string;
  duration: string;
  mode: string;
  is_mandatory?: boolean;
  isMandatory?: boolean;
}

export interface EventRow {
  id: string;
  code: string;
  name: string | null;
  date: string;
  start_time: string;
  duration_hours: string;
  location: string | null;
  city: string | null;
  max_slots: number;
  status: 'draft' | 'upcoming' | 'completed' | 'cancelled';
  coordinator_name: string;
  enrolled_count: number;
  waitlist_count: number;
  spots_left: number;
  is_enrollable: boolean;
}

export interface Coordinator {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  isActive: boolean;
}

export interface Summary {
  total_volunteers: number;
  active_volunteers: number;
  active_programs: number;
  active_activities: number;
  events_upcoming: number;
  events_conducted: number;
  total_hours: string;
  total_beneficiaries: string;
  certificates_issued: number;
  trainings_completed: number;
  volunteers_this_week: number;
  active_trainings: number;
  mail_in_flight: number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const useSummary = () =>
  useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: async () => (await api.get<Summary>('/analytics/summary')).data,
  });

export const usePrograms = (q: string, status: string) =>
  useQuery({
    queryKey: ['programs', q, status],
    queryFn: async () =>
      (
        await api.get<{ data: ProgramRow[] }>('/programs', {
          params: { q: q || undefined, status: status === 'all' ? undefined : status },
        })
      ).data.data,
  });

export const useProgram = (id: string | undefined) =>
  useQuery({
    queryKey: ['program', id],
    queryFn: async () => (await api.get<ProgramDetail>(`/programs/${id}`)).data,
    enabled: !!id,
  });

export const useActivity = (id: string | undefined) =>
  useQuery({
    queryKey: ['activity', id],
    queryFn: async () =>
      (await api.get<ActivityRow & { programId: string; programName: string; events: EventRow[]; trainings: TrainingRef[]; name: string; description: string | null; outcome: string | null; skillRequired: string | null; defaultDurationHours: string | null; defaultMaxSlots: number | null; defaultLocation: string | null; type: 'In person' | 'Online'; status: 'active' | 'discontinued' }>(`/activities/${id}`)).data,
    enabled: !!id,
  });

export const useCoordinators = () =>
  useQuery({
    queryKey: ['coordinators'],
    queryFn: async () => (await api.get<Coordinator[]>('/coordinators')).data,
  });

export const useTrainingsCatalog = () =>
  useQuery({
    queryKey: ['trainings', 'catalog'],
    queryFn: async () => (await api.get<TrainingRef[]>('/trainings')).data,
  });

/** Invalidate everything a program mutation may have touched. */
export function useInvalidateProgram() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['programs'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'summary'] });
    if (id) void qc.invalidateQueries({ queryKey: ['program', id] });
  };
}

export function useProgramAction(id: string) {
  const invalidate = useInvalidateProgram();
  return useMutation({
    mutationFn: async (action: 'publish' | 'reactivate' | { discontinue: string }) => {
      if (typeof action === 'string') {
        return (await api.post(`/programs/${id}/${action}`)).data;
      }
      return (await api.post(`/programs/${id}/discontinue`, { reason: action.discontinue })).data;
    },
    onSuccess: () => invalidate(id),
  });
}
