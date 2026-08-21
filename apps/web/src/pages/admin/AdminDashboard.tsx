import { Box, Button, Grid2 as Grid, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useSummary } from '@/api/admin';
import { PageShell, StatTile } from '@/components';

const tiles = [
  {
    title: 'Programs & Sessions',
    caption: 'Programs, activities and scheduled occurrences',
    actions: [
      { label: 'Manage', to: '/admin/programs', primary: false },
      { label: '+ New Program', to: '/admin/programs/new', primary: true },
    ],
  },
  {
    title: 'Volunteers',
    caption: 'Directory, phases, activation',
    actions: [{ label: 'View', to: '/admin/volunteers', primary: false }],
  },
  {
    title: 'Trainings',
    caption: 'Compliance & activity modules',
    actions: [{ label: 'Manage', to: '/admin/trainings', primary: false }],
  },
  {
    title: 'Field Execution & Attendance',
    caption: 'Attendance links · submissions',
    actions: [{ label: 'Manage', to: '/admin/field-execution', primary: false }],
  },
  {
    title: 'Recognition & Retention',
    caption: 'Certificates · volunteer feedback',
    actions: [{ label: 'Manage', to: '/admin/recognition', primary: false }],
  },
  {
    title: 'Dashboard & Reports',
    caption: 'Metrics, charts & automated reports',
    actions: [
      { label: 'Dashboard', to: '/admin/metrics', primary: false },
      { label: 'Reports', to: '/admin/reports', primary: false },
    ],
  },
];

export function AdminDashboard() {
  const { data: s } = useSummary();

  return (
    <PageShell title="Admin Dashboard">
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile
            label="Volunteers"
            value={s?.total_volunteers ?? '—'}
            sub={s ? `+${s.volunteers_this_week} this week` : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile label="Active programs" value={s?.active_programs ?? '—'} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile
            label="Upcoming sessions"
            value={s?.events_upcoming ?? '—'}
            sub={s ? `${s.events_conducted} completed` : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile label="Volunteer hours" value={s?.total_hours ?? '—'} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile label="Beneficiaries" value={s?.total_beneficiaries ?? '—'} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile
            label="Mail in flight"
            value={s?.mail_in_flight ?? '—'}
            sub="queued + dispatched"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {tiles.map((tile) => (
          <Grid key={tile.title} size={{ xs: 12, md: 6 }}>
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.85)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{tile.title}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', mt: 0.25 }}>
                  {tile.caption}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                {tile.actions.map((action) => (
                  <Button
                    key={action.label}
                    component={RouterLink}
                    to={action.to}
                    variant={action.primary ? 'pill' : 'pillOutlined'}
                    size="small"
                    sx={{ px: 2, py: 0.75 }}
                  >
                    {action.label}
                  </Button>
                ))}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </PageShell>
  );
}
