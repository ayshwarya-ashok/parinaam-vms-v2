import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import {
  fetchCustomPreviewBlob,
  openCertificate,
  useVolunteerCertificates,
} from '@/api/recognition';
import {
  CertificatePreviewDialog,
  CertificateThumbnail,
  ConfirmDialog,
  PageShell,
} from '@/components';
import { VolunteerPicker, type PickerVolunteer } from '@/components/VolunteerPicker';
import { tokens } from '@/theme';

/** The artwork's own paragraph — the starting point staff edit from. */
const DEFAULT_TEXT =
  'In heartfelt recognition of the time, energy and compassion so generously given to ' +
  'Parinaam Foundation. Time is the one thing none of us can get back — yet you chose to ' +
  'spend yours lifting up the urban poor communities we serve. That choice has made a real ' +
  'and lasting difference, and for it, we are deeply grateful.';

const MAX_WORDS = 75;
const MAX_CHARS = 480;

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A blob-typed error response still carries the API's JSON — read it back out. */
async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { error?: { message?: string } };
      return parsed.error?.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  return asApiError(err)?.message ?? fallback;
}

/**
 * Round 48 — custom certificates. Staff pick a volunteer, write the
 * appreciation paragraph (the only editable part of the artwork), preview the
 * exact PDF, and issue it; everything already issued to that volunteer sits
 * alongside, each with a real thumbnail of its PDF.
 */
export function CustomCertificates() {
  const [volunteer, setVolunteer] = useState<PickerVolunteer | null>(null);
  const [content, setContent] = useState(DEFAULT_TEXT);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { data: certs, isLoading: certsLoading } = useVolunteerCertificates(volunteer?.id ?? null);

  const words = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
  const tooLong = words > MAX_WORDS || content.length > MAX_CHARS;
  const tooShort = content.trim().length < 20;

  const openPreview = async () => {
    if (!volunteer) return;
    setPreviewLoading(true);
    try {
      const blob = await fetchCustomPreviewBlob(volunteer.id, content.trim());
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      enqueueSnackbar(await blobErrorMessage(err, 'Could not render the preview.'), { variant: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const issue = useMutation({
    mutationFn: async () =>
      (await api.post<{ certificateNumber: string }>('/certificates/custom', {
        volunteerId: volunteer!.id,
        content: content.trim(),
      })).data,
    onSuccess: (cert) => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      enqueueSnackbar(`Issued ${cert.certificateNumber} — PDF emailed to ${volunteer?.firstName}`, {
        variant: 'success',
      });
    },
    onError: (err) => {
      setConfirmOpen(false);
      enqueueSnackbar(asApiError(err)?.message ?? 'Issue failed', { variant: 'error' });
    },
  });

  const resend = useMutation({
    mutationFn: async (certId: string) => (await api.post(`/certificates/${certId}/resend`)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      enqueueSnackbar('Certificate re-emailed', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Resend failed', { variant: 'error' }),
  });

  return (
    <PageShell
      title="Custom Certificates"
      description="Write a personal certificate of appreciation for any volunteer. The official artwork stays fixed — only the appreciation paragraph is yours to write."
    >
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2, maxWidth: 560 }}>
        <VolunteerPicker
          value={volunteer}
          onChange={(v) => setVolunteer(v)}
          label="Volunteer"
          helperText="Search by name, email or phone — approved volunteers only."
          autoFocus
        />
      </Paper>

      {volunteer && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' }, gap: 2, alignItems: 'start' }}>
          {/* ── Compose ─────────────────────────────────────────────────── */}
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>🖋 Write the certificate</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mb: 2 }}>
              This paragraph appears between “{volunteer.firstName} {volunteer.lastName}” and the
              Goodhearts line. Logo, title, signature and date are fixed.
            </Typography>
            <TextField
              multiline
              minRows={5}
              fullWidth
              value={content}
              onChange={(e) => setContent(e.target.value)}
              inputProps={{ maxLength: MAX_CHARS }}
              helperText={
                <Box component="span" sx={{ color: tooLong ? 'error.main' : undefined }}>
                  {words} / {MAX_WORDS} words · {content.length} / {MAX_CHARS} characters
                  {tooLong ? ' — too long for the certificate' : ''}
                </Box>
              }
            />
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
              <Tooltip title="Reset the text to the standard appreciation paragraph">
                <Button size="small" variant="pillOutlined" onClick={() => setContent(DEFAULT_TEXT)}>
                  ↺ Standard text
                </Button>
              </Tooltip>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Render the exact PDF, watermarked PREVIEW — nothing is stored or emailed">
                <span>
                  <Button
                    size="small"
                    variant="pillOutlined"
                    disabled={tooShort || tooLong || previewLoading}
                    onClick={() => void openPreview()}
                  >
                    {previewLoading ? 'Rendering…' : '👁 Preview'}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Issue the certificate — it is numbered, stored, and emailed to the volunteer immediately">
                <span>
                  <Button
                    size="small"
                    variant="pill"
                    disabled={tooShort || tooLong || issue.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    🏆 Issue
                  </Button>
                </span>
              </Tooltip>
            </Box>
            {tooShort && (
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 1 }}>
                Write at least a sentence (20 characters) before previewing or issuing.
              </Typography>
            )}
          </Paper>

          {/* ── Already issued ──────────────────────────────────────────── */}
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Issued to {volunteer.firstName} {volunteer.lastName}
              {certs ? ` (${certs.length})` : ''}
            </Typography>
            {certsLoading && <CircularProgress size={22} color="secondary" />}
            {certs?.length === 0 && (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                No certificates issued to this volunteer yet.
              </Alert>
            )}
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              {(certs ?? []).map((c) => (
                <Paper key={c.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <CertificateThumbnail certificateId={c.id} width={150} onClick={() => setViewId(c.id)} />
                  <Box sx={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.certificateNumber}</Typography>
                      <Chip
                        label={c.kind === 'custom' ? 'Custom' : 'Program'}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          ...(c.kind === 'custom'
                            ? { bgcolor: 'rgba(38,145,208,0.12)', color: tokens.accentStrong }
                            : {}),
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                      {c.kind === 'custom'
                        ? `“${(c.customText ?? '').slice(0, 90)}${(c.customText ?? '').length > 90 ? '…' : ''}”`
                        : `${c.programName} · ${Number(c.hours)}h · ${c.eventsAttended} session(s)`}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                      issued {fmtDate(c.issuedAt)}
                      {c.resendCount > 0 ? ` · resent ×${c.resendCount}` : ''}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto', pt: 1, flexWrap: 'wrap' }}>
                      <Tooltip title="View the certificate here without downloading it">
                        <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3 }} onClick={() => setViewId(c.id)}>
                          👁 View
                        </Button>
                      </Tooltip>
                      <Tooltip title="Download the certificate PDF">
                        <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3 }} onClick={() => void openCertificate(c.id)}>
                          ⬇ PDF
                        </Button>
                      </Tooltip>
                      <Tooltip title="Email the existing certificate PDF to the volunteer again">
                        <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3 }}
                          disabled={resend.isPending}
                          onClick={() => resend.mutate(c.id)}>
                          ✉ Resend
                        </Button>
                      </Tooltip>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Paper>
        </Box>
      )}

      {/* The preview — the exact PDF, watermarked. */}
      <Dialog open={previewUrl !== null} onClose={closePreview} maxWidth="lg" fullWidth>
        <DialogTitle>Preview — not issued</DialogTitle>
        <DialogContent sx={{ p: 0, height: '72vh', display: 'flex' }}>
          {previewUrl && (
            <Box component="iframe" src={previewUrl} title="Certificate preview" sx={{ border: 0, width: '100%', height: '100%' }} />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={closePreview}>Close</Button>
          <Button
            variant="pill"
            disabled={issue.isPending}
            onClick={() => {
              closePreview();
              setConfirmOpen(true);
            }}
          >
            🏆 Issue this certificate
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title={`Issue custom certificate — ${volunteer?.firstName ?? ''} ${volunteer?.lastName ?? ''}`}
        message="The certificate is numbered, rendered on the official artwork, stored, and emailed to the volunteer immediately. Continue?"
        confirmLabel={issue.isPending ? 'Issuing…' : '🏆 Issue'}
        onConfirm={() => issue.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />

      <CertificatePreviewDialog certificateId={viewId} onClose={() => setViewId(null)} />
    </PageShell>
  );
}
