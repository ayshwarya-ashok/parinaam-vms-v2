import {
  Box,
  Button,
  Chip,
  Grid2 as Grid,
  Paper,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { usePartnerComplete, useSession } from '@/api/volunteer';
import { asApiError } from '@/api/client';
import { useToast } from '@/app/toast';
import { PageShell, StatTile, StatusPill } from '@/components';
import { useEnrollFlow } from '@/components/EnrollFlow';
import { SessionCard } from '@/components/SessionCard';

const PHASE_OWNER_LABEL: Record<string, string> = {
  parinaam: 'Parinaam team',
  partner: 'Partner / volunteer',
  collab: 'Parinaam + partner',
};

function fmtShort(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

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
  const toast = useToast();
  const partnerComplete = usePartnerComplete();

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
          {session.phases.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>
                Phases ({session.phases.filter((p) => p.status === 'completed').length}/
                {session.phases.length} complete)
              </Typography>
              <Box sx={{ display: 'grid', gap: 0.75, mb: 3 }}>
                {session.phases.map((p) => (
                  <Paper
                    key={p.id}
                    variant="outlined"
                    sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.7)' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>
                        {p.name}
                      </Typography>
                      {p.i_am_lead && (
                        <Chip label="you lead this" size="small" sx={{ fontSize: '0.68rem' }} />
                      )}
                      <StatusPill status={p.status} />
                    </Box>
                    <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                      {String(p.start_date).slice(0, 10) === String(p.end_date).slice(0, 10)
                        ? fmtShort(p.start_date)
                        : `${fmtShort(p.start_date)} – ${fmtShort(p.end_date)}`}{' '}
                      · {PHASE_OWNER_LABEL[p.responsibility]}
                      {p.lead_first_name ? ` · lead: ${p.lead_first_name} ${p.lead_last_name}` : ''}
                    </Typography>
                    {p.i_am_lead && p.status !== 'completed' && !p.partner_marked && (
                      <Button
                        size="small"
                        variant="pill"
                        sx={{ mt: 0.75, px: 1.5, py: 0.25 }}
                        disabled={partnerComplete.isPending}
                        onClick={() =>
                          partnerComplete.mutate(p.id, {
                            onSuccess: () => toast.success('Your side is marked complete'),
                            onError: (err) =>
                              toast.failure(
                                asApiError(err)?.message ?? 'Could not mark the phase.',
                              ),
                          })
                        }
                      >
                        ✓ Mark my side complete
                      </Button>
                    )}
                    {p.i_am_lead &&
                      p.status !== 'completed' &&
                      p.partner_marked &&
                      p.responsibility === 'collab' &&
                      !p.parinaam_marked && (
                        <Typography sx={{ mt: 0.5, fontSize: '0.78rem', color: 'text.secondary' }}>
                          Your side is done — waiting on the Parinaam team.
                        </Typography>
                      )}
                  </Paper>
                ))}
              </Box>
            </>
          )}

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

      {dialogs}
    </PageShell>
  );
}
