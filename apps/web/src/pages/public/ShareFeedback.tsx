import { Alert, Box, Button, Rating, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';
import { linkApi } from '@/api/link';
import { tokens } from '@/theme';
import { LinkFormShell, LinkThankYou } from './LinkFormShell';

const STRAP = 'Share Your Feedback';

/**
 * Round 53 — the standing anonymous feedback form at /share-feedback. The URL
 * is stable so it can sit behind the impact page's "Submit Feedback" button
 * AND be pasted into any email or message. No login, and nothing identifying
 * is stored — the form captures an opinion, not a person.
 */
export function ShareFeedbackPage() {
  const [rating, setRating] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [about, setAbout] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <LinkThankYou
        strap={STRAP}
        title="Feedback received"
        message="Thank you — your anonymous feedback is with the Parinaam team."
      />
    );
  }

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await linkApi.post('/feedback/anonymous', {
        overallRating: rating,
        npsScore: nps,
        about: about.trim() || undefined,
        comments: comments.trim() || undefined,
      });
      setDone(true);
    } catch {
      setError('Could not submit right now — please try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinkFormShell strap={STRAP} title="Tell us how we did">
      <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
        This form is <strong>anonymous</strong> — no sign-in, and nothing identifying is stored.
        Volunteered recently? Your post-session email has a personal link that ties feedback to
        that session instead.
      </Alert>
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>How was your experience with Parinaam?</Typography>
        <Rating size="large" value={rating} onChange={(_, value) => setRating(value)} />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700 }}>
          How likely are you to recommend volunteering with Parinaam?
        </Typography>
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 1 }}>
          0 = not at all likely · 10 = extremely likely
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {Array.from({ length: 11 }, (_, n) => (
            <Button
              key={n}
              variant="pillOutlined"
              size="small"
              onClick={() => setNps(n)}
              sx={{
                minWidth: 38,
                px: 0,
                py: 0.4,
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
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>What is this about?</Typography>
        <TextField
          fullWidth
          placeholder="A session, a program, or just Parinaam in general (optional)"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          inputProps={{ maxLength: 255 }}
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Your feedback</Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder="What went well, what we should change — anything you want the team to read (optional)."
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </Box>

      <Button
        variant="pill"
        fullWidth
        size="large"
        disabled={rating === null || nps === null || busy}
        onClick={handleSubmit}
      >
        {busy ? 'Submitting…' : 'Submit feedback'}
      </Button>
      {(rating === null || nps === null) && (
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 1, textAlign: 'center' }}>
          The star rating and the 0–10 score are the only required answers.
        </Typography>
      )}
    </LinkFormShell>
  );
}
