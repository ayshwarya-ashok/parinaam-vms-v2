import { Box, Button, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { openCertificate, useMyCertificates } from '@/api/recognition';
import { EmptyState, PageShell } from '@/components';
import { tokens } from '@/theme';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The volunteer's wallet — every issued certificate, downloadable any time. */
export function MyCertificates() {
  const { data, isLoading } = useMyCertificates();

  return (
    <PageShell
      title="My Certificates"
      description="One certificate per programme, with your hours summed across every session you attended. Each was also emailed to you when it was issued."
      maxWidth="lg"
    >
      {!isLoading && data?.length === 0 && (
        <EmptyState
          message="No certificates yet — they appear here once an administrator issues them after you attend sessions."
          action={
            <Button variant="pill" component={RouterLink} to="/app/events">
              Browse sessions
            </Button>
          }
        />
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {(data ?? []).map((cert) => (
          <Paper
            key={cert.id}
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 3,
              borderTop: `4px solid ${tokens.accent}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="overline" sx={{ color: tokens.accentStrong }}>
                  {cert.certType === 'corporate' ? 'Corporate appreciation' : 'Certificate of appreciation'}
                </Typography>
                <Typography variant="h5" sx={{ lineHeight: 1.25 }}>
                  {cert.programName}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '1.8rem' }}>🏆</Typography>
            </Box>

            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
              <strong>{cert.hours} hours</strong> across {cert.eventsAttended} session(s)
              {cert.periodStart && (
                <>
                  {' · '}
                  {fmtDate(cert.periodStart)}
                  {cert.periodEnd && cert.periodEnd !== cert.periodStart
                    ? ` – ${fmtDate(cert.periodEnd)}`
                    : ''}
                </>
              )}
            </Typography>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mt: 'auto',
                pt: 1,
              }}
            >
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                {cert.certificateNumber} · issued {fmtDate(cert.issuedAt)}
              </Typography>
              <Button size="small" variant="pill" sx={{ px: 1.75, py: 0.5 }} onClick={() => void openCertificate(cert.id)}>
                ⬇ Download PDF
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    </PageShell>
  );
}
