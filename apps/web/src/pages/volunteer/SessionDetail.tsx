import {
  Alert,
  Box,
  Chip,
  Grid2 as Grid,
  Paper,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { useSession } from '@/api/volunteer';
import { PageShell, StatTile, StatusPill } from '@/components';
import { useEnrollFlow } from '@/components/EnrollFlow';
import { SessionCard } from '@/components/SessionCard';

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading } = useSession(id);
  const { onEnroll, onWithdraw, onLeaveWaitlist, dialogs } = useEnrollFlow();

  if (isLoading || !session) {
    return (
      <PageShell title="Loading…">
        <span />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={session.name}
      actions={<StatusPill status={session.isDeleted ? 'deleted' : session.status} />}
    >
      {/* A deleted/cancelled session says so plainly — enrolled or not, a
          volunteer landing here sees what happened instead of a dead page. */}
      {session.status === 'cancelled' && (
        <Alert severity={session.isDeleted ? 'error' : 'warning'} sx={{ mb: 2, borderRadius: 3 }}>
          {session.isDeleted
            ? 'This session was deleted by Parinaam. It has been removed from your calendar — no action is needed from you.'
            : `This session was cancelled${session.cancelReason ? `: ${session.cancelReason}` : '.'}`}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <StatTile label="Date" value={fmtDate(session.date)} />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <StatTile label="Time" value={`${session.startTime} (${session.durationHours}h)`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile label="Venue" value={session.location ?? 'TBC'} sub={session.type} />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <StatTile
            label="Seats"
            value={`${session.capacity.enrolled}/${session.capacity.maxSlots}`}
            sub={session.capacity.waitlisted ? `${session.capacity.waitlisted} waiting` : 'no waitlist'}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatTile label="Coordinator" value={session.coordinator.name} sub={session.coordinator.email} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Required trainings</Typography>
          <Box sx={{ display: 'grid', gap: 0.75, mb: 3 }}>
            {session.trainings.length === 0 && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                No specific training required.
              </Typography>
            )}
            {session.trainings.map((t) => (
              <Paper
                key={`${t.id}-${t.source}`}
                variant="outlined"
                sx={{ px: 1.5, py: 1, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.7)' }}
              >
                <Typography sx={{ fontWeight: 700, color: t.held ? '#1E7F4F' : '#1B6EA0' }}>
                  {t.held ? '✓' : '!'}
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', flex: 1 }}>
                  <strong>{t.name}</strong> · {t.duration} · {t.mode}
                </Typography>
                <Chip
                  label={t.source === 'program' ? 'program-wide' : 'this activity'}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem' }}
                />
              </Paper>
            ))}
          </Box>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>
            Enrolled volunteers ({session.roster.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {session.roster.map((r, i) => (
              <Chip key={i} label={r.skills ? `${r.firstName} · ${r.skills}` : r.firstName} size="small" variant="outlined" />
            ))}
            {session.roster.length === 0 && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                Be the first to enroll.
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <SessionCard
            session={session}
            onEnroll={onEnroll}
            onWithdraw={onWithdraw}
            onLeaveWaitlist={onLeaveWaitlist}
          />
        </Grid>
      </Grid>

      {dialogs}
    </PageShell>
  );
}
