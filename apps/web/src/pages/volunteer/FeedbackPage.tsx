import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import {
  EligibleEvent,
  SubmitFeedbackPayload,
  useEligibleEvents,
  useFeedbackOptions,
  useMyFeedback,
} from '@/api/recognition';
import { EmptyState, PageShell } from '@/components';
import { tokens } from '@/theme';

const VOL_AGAIN = ['Definitely', 'Probably', 'Not sure', 'Unlikely'] as const;

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The per-occurrence feedback form (BR-09: once per attended session).
 * Pick a session → rate it → tag what went wrong / what to improve → submit.
 */
export function FeedbackPage() {
  const [selected, setSelected] = useState<EligibleEvent | null>(null);
  const { data: eligible, isLoading } = useEligibleEvents();
  const { data: mine } = useMyFeedback();

  return (
    <PageShell
      eyebrow="Volunteer"
      title="Share Your Experience"
      description="Feedback is per session and goes straight to the programme team. Nothing you write is published without an administrator explicitly clearing it."
      maxWidth="lg"
    >
      {selected ? (
        <FeedbackForm event={selected} onDone={() => setSelected(null)} />
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Sessions awaiting your feedback</Typography>
          {!isLoading && eligible?.length === 0 && (
            <EmptyState message="Nothing to rate right now — attend a session and it will appear here." />
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 4 }}>
            {(eligible ?? []).map((event) => (
              <Paper key={event.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 700 }}>{event.name}</Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mb: 1.5 }}>
                  {event.program_name} · {fmtDate(event.date)}
                  {event.location ? ` · ${event.location}` : ''}
                </Typography>
                <Button variant="pill" size="small" sx={{ px: 2 }} onClick={() => setSelected(event)}>
                  ★ Rate this session
                </Button>
              </Paper>
            ))}
          </Box>

          {(mine ?? []).length > 0 && (
            <>
              <Typography variant="h6" sx={{ mb: 1.5 }}>Your previous feedback</Typography>
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {(mine ?? []).map((f) => (
                  <Paper key={f.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{f.event_name}</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                          {f.program_name} · {fmtDate(f.date)}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ color: tokens.accentStrong, fontWeight: 700 }}>
                          {'★'.repeat(f.overall_rating)}{'☆'.repeat(5 - f.overall_rating)}
                        </Typography>
                        {f.is_published_testimonial && (
                          <Chip label="Published as testimonial" size="small" sx={{ height: 20, fontSize: '0.68rem' }} />
                        )}
                      </Box>
                    </Box>
                    {f.comments && (
                      <Typography sx={{ fontSize: '0.85rem', mt: 1, fontStyle: 'italic' }}>
                        “{f.comments}”
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

function ChoiceChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Chip
      label={label}
      onClick={onClick}
      variant={active ? 'filled' : 'outlined'}
      sx={
        active
          ? { bgcolor: alpha(tokens.accent, 0.16), border: `1px solid ${tokens.accent}`, fontWeight: 700 }
          : undefined
      }
    />
  );
}

function FeedbackForm({ event, onDone }: { event: EligibleEvent; onDone: () => void }) {
  const { data: options } = useFeedbackOptions();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [rating, setRating] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [volAgain, setVolAgain] = useState('');
  const [wentWell, setWentWell] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [wentWrongDetail, setWentWrongDetail] = useState('');
  const [improvements, setImprovements] = useState<string[]>([]);
  const [improvementDetail, setImprovementDetail] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, label: string) =>
    set(list.includes(label) ? list.filter((l) => l !== label) : [...list, label]);

  const submit = useMutation({
    mutationFn: async () => {
      const payload: SubmitFeedbackPayload = {
        eventId: event.id,
        overallRating: rating,
        npsScore: nps!,
        volAgain: volAgain || undefined,
        wentWell: wentWell || undefined,
        issues: issues.length ? issues : undefined,
        wentWrongDetail: wentWrongDetail || undefined,
        improvements: improvements.length ? improvements : undefined,
        improvementDetail: improvementDetail || undefined,
        comments: comments || undefined,
      };
      return (await api.post('/feedback', payload)).data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      enqueueSnackbar('Thank you — your feedback has been recorded.', { variant: 'success' });
      onDone();
    },
    onError: (err) => setError(asApiError(err)?.message ?? 'Could not submit feedback.'),
  });

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3, maxWidth: 720 }}>
      <Typography variant="overline" sx={{ color: tokens.accentStrong }}>
        {event.program_name} · {fmtDate(event.date)}
      </Typography>
      <Typography variant="h4" sx={{ mb: 3 }}>{event.name}</Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 1 — overall rating */}
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Overall, how was the session?</Typography>
      <Box sx={{ mb: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Box
            key={n}
            component="button"
            type="button"
            onClick={() => setRating(n)}
            sx={{
              border: 0,
              background: 'none',
              cursor: 'pointer',
              fontSize: '2rem',
              px: 0.25,
              color: n <= rating ? tokens.accent : 'rgba(19,35,37,0.25)',
            }}
          >
            ★
          </Box>
        ))}
      </Box>

      {/* 2 — NPS */}
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
        How likely are you to recommend volunteering with us? <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>(0 = not at all, 10 = absolutely)</Typography>
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 3 }}>
        {Array.from({ length: 11 }, (_, n) => (
          <Button
            key={n}
            variant="pillOutlined"
            size="small"
            onClick={() => setNps(n)}
            sx={{
              minWidth: 38,
              px: 0,
              ...(nps === n && {
                bgcolor: `${alpha(tokens.accent, 0.14)} !important`,
                borderColor: `${tokens.accent} !important`,
                fontWeight: 700,
              }),
            }}
          >
            {n}
          </Button>
        ))}
      </Box>

      {/* 3 — volunteer again */}
      <Typography sx={{ fontWeight: 700, mb: 0.75 }}>Would you volunteer with us again?</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {VOL_AGAIN.map((option) => (
          <ChoiceChip key={option} label={option} active={volAgain === option} onClick={() => setVolAgain(option)} />
        ))}
      </Box>

      {/* 4 — what went well */}
      <Typography sx={{ fontWeight: 700, mb: 0.75 }}>What went well?</Typography>
      <TextField
        fullWidth multiline minRows={2} sx={{ mb: 3 }}
        placeholder="The moments worth repeating…"
        value={wentWell} onChange={(e) => setWentWell(e.target.value)}
      />

      {/* 5 — issues */}
      <Typography sx={{ fontWeight: 700, mb: 0.75 }}>Did anything go wrong? <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>(pick any)</Typography></Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {(options?.issues ?? []).map((label) => (
          <ChoiceChip key={label} label={label} active={issues.includes(label)} onClick={() => toggle(issues, setIssues, label)} />
        ))}
      </Box>
      {issues.length > 0 && (
        <TextField
          fullWidth multiline minRows={2} sx={{ mb: 3 }}
          placeholder="Tell us more about what went wrong…"
          value={wentWrongDetail} onChange={(e) => setWentWrongDetail(e.target.value)}
        />
      )}

      {/* 6 — improvements */}
      <Typography sx={{ fontWeight: 700, mb: 0.75, mt: issues.length ? 0 : 1.5 }}>What should we improve?</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {(options?.improvements ?? []).map((label) => (
          <ChoiceChip key={label} label={label} active={improvements.includes(label)} onClick={() => toggle(improvements, setImprovements, label)} />
        ))}
      </Box>
      {improvements.length > 0 && (
        <TextField
          fullWidth multiline minRows={2} sx={{ mb: 3 }}
          placeholder="Any specifics on those improvements…"
          value={improvementDetail} onChange={(e) => setImprovementDetail(e.target.value)}
        />
      )}

      {/* 7 — anything else */}
      <Typography sx={{ fontWeight: 700, mb: 0.75 }}>Anything else?</Typography>
      <TextField
        fullWidth multiline minRows={2} sx={{ mb: 3 }}
        placeholder="A closing thought — with your consent, we may ask to feature it."
        value={comments} onChange={(e) => setComments(e.target.value)}
      />

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button
          variant="pill"
          size="large"
          disabled={rating === 0 || nps === null || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? 'Submitting…' : 'Submit feedback'}
        </Button>
        <Button variant="pillOutlined" size="large" onClick={onDone}>Cancel</Button>
      </Box>
    </Paper>
  );
}
