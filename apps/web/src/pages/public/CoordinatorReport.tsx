import {
  Alert,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchCoordinatorForm,
  linkFailureOf,
  submitCoordinatorForm,
} from '@/api/link';
import { tokens } from '@/theme';
import { LinkFailurePage, LinkFormShell, LinkThankYou } from './LinkFormShell';

const STATUS_OPTIONS = [
  { value: 'completed', label: '✓ Completed' },
  { value: 'partial', label: '◫ Partially completed' },
  { value: 'postponed', label: '🕐 Postponed' },
  { value: 'cancelled', label: '✕ Cancelled' },
] as const;

const STRAP = 'Field Coordinator Report';

/** The coordinator's occurrence report — the sole source of beneficiary counts. */
export function CoordinatorReportPage() {
  const { token } = useParams<{ token: string }>();

  const [status, setStatus] = useState<string>('');
  const [actualStartTime, setActualStartTime] = useState('');
  const [actualEndTime, setActualEndTime] = useState('');
  const [volunteersPresent, setVolunteersPresent] = useState('');
  const [beneficiariesReached, setBeneficiariesReached] = useState('');
  const [highlights, setHighlights] = useState('');
  const [challenges, setChallenges] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const { data, error: loadError, isLoading } = useQuery({
    queryKey: ['link', 'report', token],
    queryFn: () => fetchCoordinatorForm(token!),
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
    return (
      <LinkThankYou
        strap={STRAP}
        title="Report submitted"
        message="The occurrence report has been recorded. Beneficiary numbers feed straight into the impact dashboard — thank you."
      />
    );
  }

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await submitCoordinatorForm(
        token!,
        {
          status,
          actualStartTime,
          actualEndTime,
          volunteersPresent: Number(volunteersPresent) || 0,
          beneficiariesReached: Number(beneficiariesReached) || 0,
          highlights,
          challenges,
          notes,
        },
        images,
      );
      setDone(true);
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
    <LinkFormShell
      strap={STRAP}
      title={`Hello, ${data.coordinatorName.split(' ')[0]}`}
      event={data.event}
    >
      {data.alreadySubmitted && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          A report already exists for this session — submitting again replaces it.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Session status</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 3 }}>
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant="pillOutlined"
            onClick={() => setStatus(option.value)}
            sx={
              status === option.value
                ? {
                    bgcolor: `${alpha(tokens.accent, 0.12)} !important`,
                    borderColor: `${tokens.accent} !important`,
                    fontWeight: 700,
                  }
                : undefined
            }
          >
            {option.label}
          </Button>
        ))}
      </Box>

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Actual timing</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
        <TextField
          label="Actual start"
          type="time"
          InputLabelProps={{ shrink: true }}
          value={actualStartTime}
          onChange={(e) => setActualStartTime(e.target.value)}
        />
        <TextField
          label="Actual end"
          type="time"
          InputLabelProps={{ shrink: true }}
          value={actualEndTime}
          onChange={(e) => setActualEndTime(e.target.value)}
        />
      </Box>

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Participation</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
        <TextField
          label="Volunteers present"
          type="number"
          inputProps={{ min: 0 }}
          helperText={`${data.enrolledCount} were enrolled`}
          value={volunteersPresent}
          onChange={(e) => setVolunteersPresent(e.target.value)}
        />
        <TextField
          label="Beneficiaries reached"
          type="number"
          inputProps={{ min: 0 }}
          value={beneficiariesReached}
          onChange={(e) => setBeneficiariesReached(e.target.value)}
        />
      </Box>

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Session report</Typography>
      <Box sx={{ display: 'grid', gap: 1.5, mb: 3 }}>
        <TextField
          label="Highlights / what went well"
          multiline
          minRows={2}
          value={highlights}
          onChange={(e) => setHighlights(e.target.value)}
        />
        <TextField
          label="Challenges faced (optional)"
          multiline
          minRows={2}
          value={challenges}
          onChange={(e) => setChallenges(e.target.value)}
        />
        <TextField
          label="Additional notes (optional)"
          multiline
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700 }}>Evidence photos</Typography>
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 1 }}>
          Optional — up to 2 images. Location data is stripped automatically.
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

      <Button variant="pill" fullWidth size="large" disabled={!status || busy} onClick={handleSubmit}>
        {busy ? 'Submitting…' : 'Submit report'}
      </Button>
    </LinkFormShell>
  );
}
