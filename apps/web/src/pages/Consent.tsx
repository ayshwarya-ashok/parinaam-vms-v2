import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import { useAuth } from '@/app/auth';
import { PageShell } from '@/components';

const POLICIES = [
  {
    key: 'pocso' as const,
    tag: 'POCSO',
    color: '#bc5328',
    title: 'POCSO — Protection of Children from Sexual Offences',
    body:
      'As a Parinaam volunteer, you may work with or around children. The POCSO Act 2012 makes it ' +
      'legally mandatory to report any knowledge or suspicion of child sexual abuse to the authorities ' +
      'within 24 hours. Failure to report is a punishable offence. You are bound to maintain the dignity, ' +
      'safety and confidentiality of every child you interact with.',
    agreement:
      "I have read and agree to comply with the POCSO Act and Parinaam's child protection policy.",
  },
  {
    key: 'posh' as const,
    tag: 'POSH',
    color: '#3a60a0',
    title: 'POSH — Prevention of Sexual Harassment at Workplace',
    body:
      'Parinaam maintains a zero-tolerance policy towards sexual harassment. The POSH Act 2013 applies ' +
      'to all volunteers across all activities and locations. You agree to treat every colleague, beneficiary ' +
      'and team member with dignity and respect, and to report any incidents through the designated ' +
      'Internal Complaints Committee (ICC) channel.',
    agreement:
      "I have read and agree to comply with the POSH Act and Parinaam's anti-harassment policy.",
  },
  {
    key: 'nda' as const,
    tag: 'NDA',
    color: '#0f2b2d',
    title: 'NDA — Non-Disclosure Agreement',
    body:
      'All information you encounter during your volunteering — including beneficiary details, ' +
      'organisational data, volunteer records and programme information — is strictly confidential. ' +
      'You agree not to disclose, share or reproduce any such information to third parties, directly or ' +
      'indirectly, during or after your volunteer engagement. Breach may result in legal action.',
    agreement:
      'I have read and agree to the Non-Disclosure Agreement and confidentiality obligations.',
  },
];

/** BR-02: the legally binding gate in front of all training content. */
export function Consent() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [agreed, setAgreed] = useState({ pocso: false, posh: false, nda: false });
  const [signedName, setSignedName] = useState(
    user?.volunteer ? `${user.volunteer.firstName} ${user.volunteer.lastName}` : '',
  );
  const [consentDate, setConsentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ['consent'],
    queryFn: async () =>
      (await api.get<{ signed: boolean }>('/volunteers/me/consent')).data,
  });

  if (existing?.signed) return <Navigate to="/app/trainings" replace />;

  const allAgreed = agreed.pocso && agreed.posh && agreed.nda;

  const handleSubmit = async () => {
    if (!allAgreed || !signedName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.post('/volunteers/me/consent', {
        pocsoAgreed: true,
        poshAgreed: true,
        ndaAgreed: true,
        signedName: signedName.trim(),
        consentDate,
      });
      await queryClient.invalidateQueries({ queryKey: ['consent'] });
      await queryClient.invalidateQueries({ queryKey: ['compliance'] });
      await refresh();
      enqueueSnackbar('Compliance agreement signed. Proceeding to trainings.', {
        variant: 'success',
      });
      navigate('/app/trainings', { replace: true });
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not record your consent. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title="Compliance Agreement"
      description="Before accessing training materials, you must read and agree to Parinaam's three mandatory compliance policies. This consent is legally binding and forms part of your volunteer agreement."
      maxWidth="md"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        {POLICIES.map((policy) => (
          <Paper
            key={policy.key}
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 4,
              bgcolor: 'rgba(255,255,255,0.72)',
              borderColor: agreed[policy.key] ? 'rgba(29,107,77,0.4)' : undefined,
            }}
          >
            <Chip
              label="Mandatory"
              size="small"
              sx={{
                bgcolor: policy.color,
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.7rem',
                mb: 1,
              }}
            />
            <Typography sx={{ fontWeight: 700, mb: 0.75 }}>{policy.title}</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.7 }}>
              {policy.body}
            </Typography>
            <FormControlLabel
              sx={{ mt: 1.5, alignItems: 'flex-start' }}
              control={
                <Checkbox
                  checked={agreed[policy.key]}
                  onChange={(e) =>
                    setAgreed((a) => ({ ...a, [policy.key]: e.target.checked }))
                  }
                  sx={{ mt: -1 }}
                />
              }
              label={<Typography sx={{ fontSize: '0.9rem' }}>{policy.agreement}</Typography>}
            />
          </Paper>
        ))}

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.75)' }}>
          <Typography sx={{ fontWeight: 700, mb: 2 }}>Declaration</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Full name"
              required
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
            />
            <TextField
              label="Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={consentDate}
              onChange={(e) => setConsentDate(e.target.value)}
            />
          </Box>
        </Paper>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="pillOutlined" onClick={() => navigate('/app/dashboard')}>
            ← Back
          </Button>
          <Button
            variant="pill"
            disabled={!allAgreed || !signedName.trim() || busy}
            onClick={handleSubmit}
            sx={{ minWidth: '16rem' }}
          >
            {busy ? 'Recording…' : '✓ I Agree — Proceed to Trainings'}
          </Button>
        </Box>
      </Box>
    </PageShell>
  );
}
