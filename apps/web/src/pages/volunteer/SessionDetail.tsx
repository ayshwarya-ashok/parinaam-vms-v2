import {
  Box,
  Button,
  Chip,
  Grid2 as Grid,
  Paper,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '@/api/volunteer';
import { PageShell, StatTile } from '@/components';
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
  const navigate = useNavigate();
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
    >
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
                <Typography sx={{ fontWeight: 700, color: t.held ? '#1d6b4d' : '#bc5328' }}>
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

      <Box sx={{ mt: 3, textAlign: 'right' }}>
        <Button variant="pillOutlined" onClick={() => navigate(-1)}>
          ← Back
        </Button>
      </Box>

      {dialogs}
    </PageShell>
  );
}
