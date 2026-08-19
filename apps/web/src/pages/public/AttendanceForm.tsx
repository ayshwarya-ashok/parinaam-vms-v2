import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchVolunteerForm,
  linkFailureOf,
  submitVolunteerForm,
} from '@/api/link';
import { tokens } from '@/theme';
import { LinkFailurePage, LinkFormShell, LinkThankYou } from './LinkFormShell';

const ABSENCE_REASONS = [
  'Personal emergency',
  'Medical / Health issue',
  'Work / prior commitment',
  'Transport issue',
  'No longer available',
  'Other',
];

const STRAP = 'Volunteer Attendance';

/** The standalone volunteer attendance form — reached only via a signed link. */
export function AttendanceFormPage() {
  const { token } = useParams<{ token: string }>();

  const [attended, setAttended] = useState<boolean | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [notes, setNotes] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceDetail, setAbsenceDetail] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { data, error: loadError, isLoading } = useQuery({
    queryKey: ['link', 'attendance', token],
    queryFn: () => fetchVolunteerForm(token!),
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
    return <LinkThankYou strap={STRAP} title="Attendance recorded" message={done} />;
  }

  const canSubmit =
    attended === true
      ? arrivalTime !== '' && departureTime !== ''
      : attended === false
        ? absenceReason !== ''
        : false;

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await submitVolunteerForm(
        token!,
        attended
          ? { attended: true, arrivalTime, departureTime, notes }
          : { attended: false, absenceReason, absenceDetail, notes },
        images,
      );
      setDone(
        attended
          ? `Your ${result.hoursContributed ?? ''} hours have been logged. They count towards your certificate.`
          : 'Thanks for letting us know — we hope to see you at the next one.',
      );
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
    <LinkFormShell strap={STRAP} title={`Hello, ${data.volunteerName.split(' ')[0]}`} event={data.event}>
      {data.alreadySubmitted && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          You already submitted for this session — submitting again updates your record.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Did you attend this session?</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 3 }}>
        {[
          { value: true, label: 'Yes, I attended' },
          { value: false, label: 'No, I could not' },
        ].map((option) => (
          <Button
            key={String(option.value)}
            variant="pillOutlined"
            onClick={() => setAttended(option.value)}
            sx={
              attended === option.value
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

      {attended === true && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Attendance details</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              label="Arrival time"
              type="time"
              required
              InputLabelProps={{ shrink: true }}
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
            />
            <TextField
              label="Departure time"
              type="time"
              required
              InputLabelProps={{ shrink: true }}
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
            />
          </Box>
        </Box>
      )}

      {attended === false && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Reason for absence</Typography>
          <TextField
            select
            fullWidth
            required
            label="Select a reason"
            value={absenceReason}
            onChange={(e) => setAbsenceReason(e.target.value)}
            sx={{ mb: 1.5 }}
          >
            {ABSENCE_REASONS.map((reason) => (
              <MenuItem key={reason} value={reason}>
                {reason}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            multiline
            minRows={2}
            placeholder="Additional details (optional)…"
            value={absenceDetail}
            onChange={(e) => setAbsenceDetail(e.target.value)}
          />
        </Box>
      )}

      {attended !== null && (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>Notes / observations</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 1 }}>
              Optional — highlights or anything the team should know.
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Box>

          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>Photos from the session</Typography>
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

          <Button
            variant="pill"
            fullWidth
            size="large"
            disabled={!canSubmit || busy}
            onClick={handleSubmit}
          >
            {busy ? 'Submitting…' : 'Submit attendance'}
          </Button>
        </>
      )}
    </LinkFormShell>
  );
}
