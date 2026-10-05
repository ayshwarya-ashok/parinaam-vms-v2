import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Rating,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchFeedbackForm, linkFailureOf, submitFeedbackForm } from '@/api/link';
import { tokens } from '@/theme';
import { LinkFailurePage, LinkFormShell, LinkThankYou } from './LinkFormShell';

const VOL_AGAIN = ['Definitely', 'Probably', 'Not sure', 'Unlikely'] as const;

const STRAP = 'Session Feedback';

/**
 * Round 51 — the standalone feedback form, reached only via the signed link in
 * the "How was it?" email. No login: the token is the authorization, exactly
 * like the attendance form. Submissions land in the same feedback_submissions
 * table the admin / field-coordinator Feedback screen reads.
 */
export function FeedbackFormPage() {
  const { token } = useParams<{ token: string }>();

  const [rating, setRating] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [volAgain, setVolAgain] = useState('');
  const [wentWell, setWentWell] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [wentWrongDetail, setWentWrongDetail] = useState('');
  const [improvements, setImprovements] = useState<string[]>([]);
  const [improvementDetail, setImprovementDetail] = useState('');
  const [comments, setComments] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { data, error: loadError, isLoading } = useQuery({
    queryKey: ['link', 'feedback', token],
    queryFn: () => fetchFeedbackForm(token!),
    retry: false,
  });

  if (isLoading) {
    return (
      <LinkFormShell strap={STRAP} title="Loading…">
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress color="secondary" />
        </Box>
      </LinkFormShell>
    );
  }
  if (loadError || !data) {
    return <LinkFailurePage strap={STRAP} failure={linkFailureOf(loadError)} />;
  }
  if (done) {
    return <LinkThankYou strap={STRAP} title="Feedback received" message={done} />;
  }

  const toggle = (list: string[], set: (next: string[]) => void, label: string) =>
    set(list.includes(label) ? list.filter((l) => l !== label) : [...list, label]);

  const canSubmit = rating !== null && nps !== null;

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await submitFeedbackForm(
        token!,
        {
          overallRating: rating!,
          npsScore: nps!,
          volAgain: volAgain || undefined,
          wentWell,
          issues,
          wentWrongDetail,
          improvements,
          improvementDetail,
          comments,
        },
        images,
      );
      setDone('Your feedback is with the program team — it shapes how the next session runs.');
    } catch (err) {
      const failure = linkFailureOf(err);
      setError(
        failure === 'UNKNOWN'
          ? 'Could not submit — please check the form and try again.'
          : 'This link is no longer usable. Contact admin@parinaam.org.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinkFormShell strap={STRAP} title={`Hello, ${data.volunteerName}`} event={data.event}>
      {data.alreadySubmitted && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          You already rated this session — submitting again replaces your earlier answers.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>How was the session overall?</Typography>
        <Rating
          size="large"
          value={rating}
          onChange={(_, value) => setRating(value)}
        />
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
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Would you volunteer again?</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {VOL_AGAIN.map((option) => (
            <Button
              key={option}
              variant="pillOutlined"
              size="small"
              onClick={() => setVolAgain(volAgain === option ? '' : option)}
              sx={
                volAgain === option
                  ? {
                      bgcolor: `${alpha(tokens.accent, 0.14)} !important`,
                      borderColor: `${tokens.accent} !important`,
                      fontWeight: 700,
                    }
                  : undefined
              }
            >
              {option}
            </Button>
          ))}
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>What went well?</Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          placeholder="Optional…"
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
        />
      </Box>

      {data.options.issues.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>Anything that didn't go well?</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 0.5 }}>
            Optional — tick anything that applies.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {data.options.issues.map((label) => (
              <FormControlLabel
                key={label}
                control={
                  <Checkbox
                    size="small"
                    checked={issues.includes(label)}
                    onChange={() => toggle(issues, setIssues, label)}
                  />
                }
                label={<Typography sx={{ fontSize: '0.88rem' }}>{label}</Typography>}
              />
            ))}
          </Box>
          {issues.length > 0 && (
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="Tell us more (optional)…"
              value={wentWrongDetail}
              onChange={(e) => setWentWrongDetail(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      )}

      {data.options.improvements.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>What should we improve?</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 0.5 }}>
            Optional — tick anything that applies.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {data.options.improvements.map((label) => (
              <FormControlLabel
                key={label}
                control={
                  <Checkbox
                    size="small"
                    checked={improvements.includes(label)}
                    onChange={() => toggle(improvements, setImprovements, label)}
                  />
                }
                label={<Typography sx={{ fontSize: '0.88rem' }}>{label}</Typography>}
              />
            ))}
          </Box>
          {improvements.length > 0 && (
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="Tell us more (optional)…"
              value={improvementDetail}
              onChange={(e) => setImprovementDetail(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Anything else?</Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          placeholder="Optional — anything you want the team to read."
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700 }}>Photos from the session</Typography>
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 1 }}>
          Optional — up to 2 images. Location data is stripped automatically; nothing is
          published without an administrator clearing it first.
        </Typography>
        <Button variant="pillOutlined" component="label" size="small">
          📷 {images.length > 0 ? `${images.length} selected — change` : 'Choose images'}
          <input
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setImages(Array.from(e.target.files ?? []).slice(0, 2))}
          />
        </Button>
        {images.map((image) => (
          <Typography key={image.name} sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 0.5 }}>
            🖼 {image.name}
          </Typography>
        ))}
      </Box>

      <Button variant="pill" fullWidth size="large" disabled={!canSubmit || busy} onClick={handleSubmit}>
        {busy ? 'Submitting…' : 'Submit feedback'}
      </Button>
      {!canSubmit && (
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 1, textAlign: 'center' }}>
          The star rating and the 0–10 score are the only required answers.
        </Typography>
      )}
    </LinkFormShell>
  );
}
