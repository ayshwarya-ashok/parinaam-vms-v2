import { Box, Button, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useCertificateCandidates, useFeedbackAnalytics } from '@/api/recognition';
import { PageShell, StatTile } from '@/components';
import { tokens } from '@/theme';

/** The recognition landing: the numbers, and the two doors. */
export function RecognitionHub() {
  const { data: candidates } = useCertificateCandidates({});
  const { data: analytics } = useFeedbackAnalytics();

  const issued = candidates?.filter((c) => c.certificate?.issued).length ?? 0;
  const pending = candidates?.filter((c) => !c.certificate?.issued).length ?? 0;
  const stale = candidates?.filter((c) => c.certificate?.stale).length ?? 0;

  return (
    <PageShell
      title="Recognition & Retention"
      description="Certificates say thank you; feedback tells you what to fix. Both live here."
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatTile label="Certificates issued" value={issued} sub={stale > 0 ? `${stale} outdated` : undefined} />
        <StatTile label="Awaiting issue" value={pending} sub="attended, not yet certified" />
        <StatTile label="Feedback received" value={analytics?.total ?? '—'} sub={`${analytics?.published ?? 0} published`} />
        <StatTile
          label="Avg rating / NPS"
          value={analytics?.avgRating != null ? `${analytics.avgRating} ★` : '—'}
          sub={analytics?.nps != null ? `NPS ${analytics.nps}` : undefined}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h5" sx={{ mb: 1 }}>🏆 Certificates</Typography>
          <Typography color="text.secondary" sx={{ mb: 2, fontSize: '0.9rem' }}>
            One certificate per volunteer per programme, hours summed across every
            session attended. Issue individually or for a whole programme at once —
            the PDF is emailed automatically.
          </Typography>
          <Button variant="pill" component={RouterLink} to="/admin/recognition/certificates">
            Manage certificates
          </Button>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h5" sx={{ mb: 1 }}>💬 Feedback</Typography>
          <Typography color="text.secondary" sx={{ mb: 2, fontSize: '0.9rem' }}>
            Per-session ratings, NPS and tagged issues. Publishing a testimonial is
            an explicit act here — nothing a volunteer writes surfaces publicly on
            its own.
          </Typography>
          <Button variant="pill" component={RouterLink} to="/admin/recognition/feedback">
            Review feedback
          </Button>
        </Paper>
      </Box>

      {analytics && analytics.topIssues.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>What volunteers flag most</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <RankedList title="Top issues" rows={analytics.topIssues} color={tokens.accentStrong} />
            <RankedList title="Most-requested improvements" rows={analytics.topImprovements} color={tokens.mint} />
          </Box>
        </Paper>
      )}
    </PageShell>
  );
}

function RankedList({
  title,
  rows,
  color,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  color: string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 1 }}>{title}</Typography>
      {rows.slice(0, 5).map((row) => (
        <Box key={row.label} sx={{ mb: 0.75 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
            <span>{row.label}</span>
            <strong>{row.count}</strong>
          </Box>
          <Box sx={{ height: 6, borderRadius: 999, bgcolor: 'rgba(31,43,54,0.08)' }}>
            <Box
              sx={{
                height: 6,
                borderRadius: 999,
                width: `${(row.count / max) * 100}%`,
                bgcolor: color,
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
