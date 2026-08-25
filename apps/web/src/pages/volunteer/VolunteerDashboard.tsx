import { Box, Button, Chip, Grid2 as Grid, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useMyEnrollments, useMyPhases, useSessions } from '@/api/volunteer';
import { useAuth } from '@/app/auth';
import { PageShell, StatTile } from '@/components';
import { useEnrollFlow } from '@/components/EnrollFlow';
import { SessionCard } from '@/components/SessionCard';

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function VolunteerDashboard() {
  const { user } = useAuth();
  const { data: mine } = useMyEnrollments();
  const { data: open = [] } = useSessions({ scope: 'open', sort: 'date' });
  const { data: myPhases = [] } = useMyPhases();
  const { onEnroll, onWithdraw, onLeaveWaitlist, dialogs } = useEnrollFlow();

  const upcoming = (mine?.enrollments ?? []).filter((e) => e.event_status === 'upcoming');
  const totalHours = upcoming.reduce((sum, e) => sum + Number(e.duration_hours), 0);
  const suggestions = open.filter((s) => s.myState === 'none').slice(0, 6);

  return (
    <PageShell
      title={`Welcome${user?.volunteer ? `, ${user.volunteer.firstName}` : ' to Parinaam'}`}
      description="Choose sessions that fit your schedule. Enrolling sends you a confirmation email with anything left to complete."
      actions={
        <Chip
          label={`Phase: ${user?.volunteer?.phase ?? '—'}`}
          sx={{ fontWeight: 700, bgcolor: 'rgba(30,127,79,0.1)', color: '#1E7F4F' }}
        />
      }
    >
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile label="Upcoming sessions" value={upcoming.length} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile label="Hours committed" value={totalHours} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile label="Waitlists" value={mine?.waitlists.length ?? 0} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.75)', height: '100%' }}>
            <Typography sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', mb: 1 }}>
              Quick links
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              <Button component={RouterLink} to="/app/events" size="small" variant="pillOutlined" sx={{ px: 1.5, py: 0.25 }}>
                Browse
              </Button>
              <Button component={RouterLink} to="/app/calendar" size="small" variant="pillOutlined" sx={{ px: 1.5, py: 0.25 }}>
                Calendar
              </Button>
              <Button component={RouterLink} to="/app/trainings" size="small" variant="pillOutlined" sx={{ px: 1.5, py: 0.25 }}>
                Trainings
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {myPhases.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>
            My phase responsibilities
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {myPhases.map((p) => (
              <Paper
                key={p.id}
                variant="outlined"
                component={RouterLink}
                to={`/app/events/${p.event_id}`}
                sx={{
                  p: 1.75,
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.8)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  flexWrap: 'wrap',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {p.name} — {p.event_name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                    {p.program_name} · {fmtDate(p.start_date)}
                    {String(p.end_date).slice(0, 10) !== String(p.start_date).slice(0, 10)
                      ? ` – ${fmtDate(p.end_date)}`
                      : ''}{' '}
                    · you are the partner lead
                    {p.partner_marked_at ? ' · your side is done' : ' · your mark is pending'}
                  </Typography>
                </Box>
                <Chip
                  label={p.status === 'inprogress' ? 'in progress' : p.status}
                  size="small"
                  sx={{ fontSize: '0.7rem' }}
                />
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {upcoming.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>
            My upcoming sessions
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {upcoming.map((e) => (
              <Paper
                key={e.id}
                variant="outlined"
                component={RouterLink}
                to={`/app/events/${e.event_id}`}
                sx={{
                  p: 1.75,
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.8)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  flexWrap: 'wrap',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {e.event_name}
                    {e.promoted_from_waitlist && (
                      <Chip label="promoted from waitlist" size="small" sx={{ ml: 1, fontSize: '0.68rem', height: 20 }} />
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                    {e.program_name} · {fmtDate(e.date)} at {String(e.start_time).slice(0, 5)} ·{' '}
                    {e.location ?? 'location TBC'}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'secondary.dark' }}>
                  {e.duration_hours}h
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {(mine?.waitlists.length ?? 0) > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>
            My waitlists
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {mine!.waitlists.map((w) => (
              <Paper key={w.event_id} variant="outlined" sx={{ p: 1.75, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.7)' }}>
                <Typography sx={{ fontSize: '0.92rem' }}>
                  <strong>#{w.position}</strong> in line for <strong>{w.event_name}</strong> —{' '}
                  {w.program_name}, {fmtDate(w.date)}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>
        Open sessions for you
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
        {suggestions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onEnroll={onEnroll}
            onWithdraw={onWithdraw}
            onLeaveWaitlist={onLeaveWaitlist}
          />
        ))}
      </Box>
      {suggestions.length === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>
          Nothing open right now — check back soon, or browse everything.
        </Typography>
      )}

      {dialogs}
    </PageShell>
  );
}
