import { Box, Button, ButtonBase, Grid2 as Grid, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useSummary } from '@/api/admin';
import { PageShell, StatTile } from '@/components';
import { useAuth } from '@/app/auth';

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
  // The coordinator dashboard is the admin one minus what the role cannot
  // reach: no Trainings or Reports cards, no "+ New Program".
  const readOnly = useAuth().user?.role === 'field_coordinator';
  const visibleTiles = readOnly
    ? tiles
        .filter((t) => t.title !== 'Trainings')
        .map((t) => ({
          ...t,
          title: t.title === 'Dashboard & Reports' ? 'Metrics' : t.title,
          actions: t.actions.filter((a) => !a.primary && a.to !== '/admin/reports'),
        }))
    : tiles;

  const { data: s } = useSummary();

  return (
    <PageShell title={readOnly ? 'Field Coordinator Dashboard' : 'Admin Dashboard'}>
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
            sub={s ? `${s.events_inprogress > 0 ? `${s.events_inprogress} in progress · ` : ''}${s.events_conducted} completed` : undefined}
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

      {/* Awaiting your review — the day's actionable backlog, each card a link. */}
      {(() => {
        const review = [
          // Approving registrations is admin-only — a coordinator cannot act
          // on this card, so they do not get it.
          ...(readOnly ? [] : [{
            count: s?.pending_registrations,
            label: 'Registrations awaiting review',
            hint: 'approve or reject new volunteers',
            to: '/admin/volunteers?registration=pending',
          }]),
          {
            count: s?.sessions_to_close,
            label: 'Sessions past their date to close',
            hint: 'record attendance, then mark completed',
            to: '/admin/field-execution',
          },
          {
            count: s?.certificates_pending,
            label: 'Certificates ready to issue',
            hint: 'attended hours with no issued certificate',
            to: '/admin/recognition/certificates',
          },
        ];
        const open = review.filter((r) => (r.count ?? 0) > 0);
        return (
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontWeight: 700, mb: 1.25 }}>Awaiting your review</Typography>
            {open.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.6)' }}>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                  ✓ Nothing waiting on you right now.
                </Typography>
              </Paper>
            ) : (
              <Grid container spacing={2}>
                {open.map((r) => (
                  <Grid key={r.label} size={{ xs: 12, sm: 6, md: 4 }}>
                    <ButtonBase
                      component={RouterLink}
                      to={r.to}
                      sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 3 }}
                    >
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          height: '100%',
                          bgcolor: 'rgba(255,208,54,0.12)',
                          borderColor: 'rgba(179,126,0,0.35)',
                          transition: 'transform 120ms ease, box-shadow 120ms ease',
                          '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                          <Typography sx={{ fontSize: '1.5rem', fontWeight: 800 }}>{r.count}</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>{r.label}</Typography>
                        </Box>
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', mt: 0.5 }}>
                          {r.hint} →
                        </Typography>
                      </Paper>
                    </ButtonBase>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        );
      })()}

      <Grid container spacing={2}>
        {visibleTiles.map((tile) => (
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
