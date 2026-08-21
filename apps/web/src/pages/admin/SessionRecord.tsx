import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import { useDynamicCrumbs } from '@/app/breadcrumbs';
import {
  EmptyState,
  PageShell,
  SortableCell,
  StatTile,
  StatusPill,
  useTableSort,
} from '@/components';
import { tokens } from '@/theme';

const ABSENCE_REASONS = [
  'Personal emergency',
  'Medical / Health issue',
  'Work / prior commitment',
  'Transport issue',
  'No longer available',
  'Other',
] as const;

interface RosterRow {
  volunteer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  enrollment_status: string | null;
  enrolled_at: string | null;
  enrollment_skills: string | null;
  promoted_from_waitlist: boolean | null;
  record_id: string | null;
  attended: boolean | null;
  arrival_time: string | null;
  departure_time: string | null;
  hours_contributed: string | null;
  absence_reason: string | null;
  absence_detail: string | null;
  notes: string | null;
  source: 'self' | 'coordinator' | 'admin' | null;
  recorded_at: string | null;
  photo_count: number;
}

interface SessionRecordPayload {
  event: {
    id: string;
    code: string;
    name: string;
    date: string;
    start_time: string;
    duration_hours: string | null;
    location: string | null;
    city: string | null;
    status: 'draft' | 'upcoming' | 'completed' | 'cancelled';
    max_slots: number | null;
    cancel_reason: string | null;
    activity_id: string;
    activity_name: string;
    program_id: string;
    program_name: string;
    coordinator_name: string | null;
    coordinator_email: string | null;
    volunteer_email_sent: boolean | null;
    coordinator_email_sent: boolean | null;
  };
  roster: RosterRow[];
  waitlist: Array<{
    position: number;
    volunteer_id: string;
    first_name: string;
    last_name: string;
    email: string;
  }>;
  report: {
    id: string;
    status: string;
    actualStartTime: string | null;
    actualEndTime: string | null;
    volunteersPresent: number | null;
    beneficiariesReached: number | null;
    highlights: string | null;
    challenges: string | null;
    notes: string | null;
    submittedAt: string;
  } | null;
  photos: Array<{ id: string; caption: string | null }>;
  summary: { enrolled: number; submitted: number; attended: number; totalHours: number };
}

interface EditState {
  row: RosterRow;
  attended: boolean;
  hours: string;
  notes: string;
  absenceReason: string;
}

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const SOURCE_LABEL: Record<string, string> = {
  self: 'volunteer',
  coordinator: 'coordinator',
  admin: 'admin',
};

/**
 * One session, end to end: what was scheduled, who was on the roster, what
 * each volunteer logged, what the coordinator reported — and the ability to
 * correct any of it.
 *
 * The roster is the enrolment list, not the submission list: a volunteer who
 * never filed anything is exactly who an admin is chasing, so they appear here
 * with an empty row and a "Log attendance" action.
 */
export function SessionRecord() {
  const { id } = useParams<{ id: string }>();
  const [edit, setEdit] = useState<EditState | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data, isLoading } = useQuery({
    queryKey: ['session-record', id],
    queryFn: async () => (await api.get<SessionRecordPayload>(`/events/${id}/session-record`)).data,
    enabled: !!id,
  });

  useDynamicCrumbs(
    data
      ? [
          { label: 'Field Execution', to: '/admin/field-execution' },
          { label: data.event.program_name, to: `/admin/programs/${data.event.program_id}` },
        ]
      : null,
  );

  const roster = useTableSort(data?.roster, {
    volunteer: (r) => `${r.first_name} ${r.last_name}`,
    enrolledAt: (r) => r.enrolled_at,
    skills: (r) => r.enrollment_skills,
    attended: (r) => (r.record_id === null ? null : r.attended),
    hours: (r) => (r.hours_contributed === null ? null : Number(r.hours_contributed)),
    source: (r) => r.source,
  });

  const save = useMutation({
    mutationFn: async (state: EditState) => {
      const body = {
        attended: state.attended,
        hoursContributed: state.hours === '' ? undefined : Number(state.hours),
        notes: state.notes || undefined,
        absenceReason: !state.attended && state.absenceReason ? state.absenceReason : undefined,
      };
      // An existing record is corrected; a missing one is created for the
      // volunteer who never submitted the form.
      return state.row.record_id
        ? (await api.patch(`/attendance/${state.row.record_id}`, body)).data
        : (await api.post(`/events/${id}/attendance`, { ...body, volunteerId: state.row.volunteer_id })).data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session-record', id] });
      void queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setEdit(null);
      enqueueSnackbar('Attendance updated — recorded as an admin correction', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Update failed', { variant: 'error' }),
  });

  if (isLoading || !data) {
    return (
      <PageShell title="Session record">
        <span />
      </PageShell>
    );
  }

  const { event, waitlist, report, summary } = data;
  const notSubmitted = data.roster.filter((r) => r.record_id === null).length;
  // Before the day, the question is "who is coming?"; after it, "who came and
  // for how long?". Same roster, different columns.
  const isUpcoming = event.status === 'draft' || event.status === 'upcoming';

  return (
    <PageShell
      title={event.name}
      description={`${event.code} · ${event.activity_name}`}
      actions={<StatusPill status={event.status} />}
    >
      {event.status === 'cancelled' && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          This session was cancelled{event.cancel_reason ? `: ${event.cancel_reason}` : '.'}
        </Alert>
      )}

      {/* ── The occurrence itself ───────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          <Detail label="Date" value={fmtDate(event.date)} />
          <Detail
            label="Time"
            value={`${event.start_time?.slice(0, 5) ?? '—'}${event.duration_hours ? ` · ${Number(event.duration_hours)}h` : ''}`}
          />
          <Detail label="Location" value={[event.location, event.city].filter(Boolean).join(', ') || '—'} />
          <Detail
            label="Coordinator"
            value={event.coordinator_name ?? '—'}
            sub={event.coordinator_email ?? undefined}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            variant="outlined"
            label={`Volunteer links ${event.volunteer_email_sent ? 'sent' : 'not sent'}`}
            sx={{ color: event.volunteer_email_sent ? tokens.success : tokens.accentStrong }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Coordinator link ${event.coordinator_email_sent ? 'sent' : 'not sent'}`}
            sx={{ color: event.coordinator_email_sent ? tokens.success : tokens.accentStrong }}
          />
          {event.max_slots !== null && (
            <Chip size="small" variant="outlined" label={`Capacity ${summary.enrolled}/${event.max_slots}`} />
          )}
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 2,
        }}
      >
        <StatTile
          label="Enrolled"
          value={summary.enrolled}
          sub={event.max_slots !== null ? `of ${event.max_slots} slots` : undefined}
        />
        {isUpcoming ? (
          <>
            <StatTile label="Waitlisted" value={waitlist.length} />
            <StatTile
              label="Slots left"
              value={event.max_slots !== null ? Math.max(0, event.max_slots - summary.enrolled) : '—'}
            />
            <StatTile label="Status" value={event.status === 'draft' ? 'Draft' : 'Open'} sub={event.status === 'draft' ? 'not visible to volunteers' : 'accepting enrolments'} />
          </>
        ) : (
          <>
            <StatTile label="Responded" value={summary.submitted} sub={notSubmitted > 0 ? `${notSubmitted} silent` : undefined} />
            <StatTile label="Attended" value={summary.attended} />
            <StatTile label="Hours logged" value={summary.totalHours} />
          </>
        )}
      </Box>

      {/* ── Attendance marked by volunteers ─────────────────────────────────── */}
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {isUpcoming ? `Enrolled volunteers (${summary.enrolled})` : 'Volunteer attendance'}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
        {isUpcoming
          ? 'Who has signed up so far. Hours are logged after the session runs.'
          : 'What each volunteer logged, and who logged it. Any row can be corrected.'}
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell sortKey="volunteer" sort={roster.sort} onSort={roster.toggle}>Volunteer</SortableCell>
              {isUpcoming ? (
                <>
                  <SortableCell sortKey="enrolledAt" sort={roster.sort} onSort={roster.toggle}>Enrolled on</SortableCell>
                  <SortableCell sortKey="skills" sort={roster.sort} onSort={roster.toggle}>Skills offered</SortableCell>
                  <TableCell align="center">Route</TableCell>
                </>
              ) : (
                <>
                  <SortableCell sortKey="attended" sort={roster.sort} onSort={roster.toggle} align="center">Attended</SortableCell>
                  <TableCell align="center">Times</TableCell>
                  <SortableCell sortKey="hours" sort={roster.sort} onSort={roster.toggle} align="right">Hours</SortableCell>
                  <SortableCell sortKey="source" sort={roster.sort} onSort={roster.toggle}>Logged by</SortableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Action</TableCell>
                </>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {roster.sorted.map((r) => (
              <TableRow key={r.volunteer_id}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {r.first_name} {r.last_name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {r.email}
                    {r.enrollment_status === null ? ' · withdrew' : ''}
                  </Typography>
                </TableCell>
                {isUpcoming ? (
                  <>
                    <TableCell sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {r.enrolled_at ? fmtDate(r.enrolled_at) : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', color: 'text.secondary', maxWidth: 240 }}>
                      {r.enrollment_skills ?? '—'}
                    </TableCell>
                    <TableCell align="center">
                      {r.promoted_from_waitlist ? (
                        <Chip size="small" label="from waitlist" sx={{ height: 20, fontSize: '0.7rem' }} />
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>direct</Typography>
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                <TableCell align="center">
                  {r.record_id === null ? (
                    <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                      no response
                    </Typography>
                  ) : r.attended ? (
                    <Typography sx={{ color: tokens.success, fontWeight: 700 }}>✓ Present</Typography>
                  ) : (
                    <Box>
                      <Typography sx={{ color: tokens.accentStrong, fontWeight: 700 }}>✕ Absent</Typography>
                      {r.absence_reason && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                          {r.absence_reason}
                        </Typography>
                      )}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="center" sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {r.arrival_time
                    ? `${r.arrival_time.slice(0, 5)} – ${r.departure_time?.slice(0, 5) ?? '?'}`
                    : '—'}
                </TableCell>
                <TableCell align="right">
                  {r.hours_contributed ? <strong>{Number(r.hours_contributed)}</strong> : '—'}
                </TableCell>
                <TableCell>
                  {r.source ? (
                    <Chip
                      size="small"
                      label={SOURCE_LABEL[r.source]}
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: r.source === 'admin' ? 'rgba(217,108,63,0.14)' : 'rgba(19,35,37,0.07)',
                      }}
                    />
                  ) : (
                    '—'
                  )}
                  {r.photo_count > 0 && (
                    <Typography component="span" sx={{ fontSize: '0.72rem', color: 'text.secondary', ml: 0.5 }}>
                      📷 {r.photo_count}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary', maxWidth: 200 }}>
                  {r.notes ?? r.absence_detail ?? '—'}
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="pillOutlined"
                    sx={{ px: 1.25, py: 0.3, whiteSpace: 'nowrap' }}
                    onClick={() =>
                      setEdit({
                        row: r,
                        attended: r.attended ?? true,
                        hours: r.hours_contributed ? String(Number(r.hours_contributed)) : '',
                        notes: r.notes ?? '',
                        absenceReason: r.absence_reason ?? '',
                      })
                    }
                  >
                    {r.record_id ? '✎ Correct' : '+ Log'}
                  </Button>
                </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {data.roster.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  Nobody is enrolled in this session yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Waitlist (only meaningful while the session is still ahead) ─────── */}
      {isUpcoming && waitlist.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Waitlist ({waitlist.length})
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
            Promoted automatically, in this order, the moment a slot frees up.
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell align="center">#</TableCell>
                  <TableCell>Volunteer</TableCell>
                  <TableCell>Email</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {waitlist.map((w) => (
                  <TableRow key={w.volunteer_id}>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>{w.position}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {w.first_name} {w.last_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>{w.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ── The coordinator's occurrence report ─────────────────────────────── */}
      <Typography variant="h6" sx={{ mb: 1 }}>
        Coordinator report
      </Typography>
      {report ? (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2 }}>
            <Detail label="Session status" value={report.status} />
            <Detail
              label="Actual timing"
              value={
                report.actualStartTime
                  ? `${report.actualStartTime.slice(0, 5)} – ${report.actualEndTime?.slice(0, 5) ?? '?'}`
                  : '—'
              }
            />
            <Detail label="Volunteers present" value={String(report.volunteersPresent ?? '—')} />
            <Detail
              label="Beneficiaries reached"
              value={report.beneficiariesReached?.toLocaleString('en-IN') ?? '—'}
            />
          </Box>
          {report.highlights && <Quote label="Highlights" text={report.highlights} />}
          {report.challenges && <Quote label="Challenges" text={report.challenges} />}
          {report.notes && <Quote label="Notes" text={report.notes} />}
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1.5 }}>
            Filed {new Date(report.submittedAt).toLocaleString('en-IN')}
            {data.photos.length > 0 ? ` · ${data.photos.length} evidence photo(s)` : ''}
          </Typography>
        </Paper>
      ) : (
        <EmptyState
          message={
            isUpcoming
              ? 'The coordinator files this after the session runs — beneficiary numbers come from that report.'
              : event.coordinator_email_sent
                ? 'The coordinator has been sent the link but has not filed a report yet.'
                : 'No report yet — the coordinator link has not been sent for this session.'
          }
        />
      )}

      {/* ── Correction dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={edit !== null}
        onClose={() => setEdit(null)}
        PaperProps={{ sx: { borderRadius: 4, width: 460, maxWidth: '100%' } }}
      >
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {edit?.row.record_id ? 'Correct attendance' : 'Log attendance'} — {edit?.row.first_name}{' '}
          {edit?.row.last_name}
        </DialogTitle>
        {edit && (
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              {edit.row.record_id
                ? `This overwrites what the ${SOURCE_LABEL[edit.row.source ?? 'self']} logged. The change is attributed to you in the audit trail.`
                : 'This volunteer never submitted the form. Your entry is recorded as an admin correction.'}
            </Alert>
            <TextField
              select
              label="Were they there?"
              value={edit.attended ? 'yes' : 'no'}
              onChange={(e) => setEdit({ ...edit, attended: e.target.value === 'yes' })}
            >
              <MenuItem value="yes">✓ Present</MenuItem>
              <MenuItem value="no">✕ Absent</MenuItem>
            </TextField>
            {edit.attended ? (
              <TextField
                label="Hours contributed"
                type="number"
                inputProps={{ min: 0, step: 0.25 }}
                value={edit.hours}
                onChange={(e) => setEdit({ ...edit, hours: e.target.value })}
              />
            ) : (
              <TextField
                select
                label="Reason for absence"
                value={edit.absenceReason}
                onChange={(e) => setEdit({ ...edit, absenceReason: e.target.value })}
              >
                <MenuItem value="">Not stated</MenuItem>
                {ABSENCE_REASONS.map((reason) => (
                  <MenuItem key={reason} value={reason}>
                    {reason}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Note"
              multiline
              minRows={2}
              placeholder="Why this was corrected — e.g. taken from the coordinator's paper sheet."
              value={edit.notes}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setEdit(null)}>
            Cancel
          </Button>
          <Button variant="pill" disabled={save.isPending} onClick={() => edit && save.mutate(edit)}>
            {save.isPending ? 'Saving…' : 'Save attendance'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>{sub}</Typography>}
    </Box>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <Typography sx={{ fontSize: '0.88rem', mt: 1 }}>
      <Box
        component="span"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          mr: 0.75,
        }}
      >
        {label}:
      </Box>
      {text}
    </Typography>
  );
}
