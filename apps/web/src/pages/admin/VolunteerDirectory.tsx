import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, api, asApiError } from '@/api/client';
import { ConfirmDialog, FilterBar, PageShell, StatusPill } from '@/components';
import { tokens } from '@/theme';

type RegistrationStatus = 'pending' | 'approved' | 'rejected';

interface DirectoryRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  category: 'Individual' | 'CSR';
  organization: string | null;
  phase: 'Onboarding' | 'In Training' | 'Active' | 'Inactive';
  isActive: boolean;
  registrationStatus: RegistrationStatus;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface VolunteerDetail extends Omit<DirectoryRow, 'organization'> {
  gender: string | null;
  dateOfBirth: string | null;
  state: string | null;
  occupation: string | null;
  skills: string | null;
  languages: string | null;
  areasOfInterest: string | null;
  availability: string | null;
  availabilityNotes: string | null;
  organization: { id: string; name: string } | null;
  consentSigned: boolean;
  reviewedByEmail: string | null;
  participation: { total_hours: string; events_attended: number; programs: number };
}

type ReferenceOptions = Record<string, Array<{ code: string; label: string }>>;

const statusPill: Record<RegistrationStatus, 'pending' | 'active' | 'cancelled'> = {
  pending: 'pending',
  approved: 'active',
  rejected: 'cancelled',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The admin volunteer directory: review registrations, and control accounts.
 *
 * Two distinct decisions live here and are deliberately not conflated:
 *   • Approve / Reject — the one-time verdict on a registration. Rejection
 *     needs a reason and deactivates the account.
 *   • Activate / Inactivate — ongoing account control for anyone already
 *     reviewed. (This replaced a "Login enabled" switch: a toggle labelled
 *     with a system capability told an admin nothing about what it does to
 *     the person.)
 */
export function VolunteerDirectory() {
  const [q, setQ] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<DirectoryRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deactivating, setDeactivating] = useState<DirectoryRow | null>(null);
  const limit = 25;

  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data } = useQuery({
    queryKey: ['directory', q, registrationStatus, category, page],
    queryFn: async () =>
      (
        await api.get<{ data: DirectoryRow[]; meta: { total: number; pending: number } }>('/volunteers', {
          params: {
            q: q || undefined,
            registrationStatus: registrationStatus === 'all' ? undefined : registrationStatus,
            category: category === 'all' ? undefined : category,
            limit,
            offset: page * limit,
          },
        })
      ).data,
  });

  const { data: options = {} } = useQuery({
    queryKey: ['reference-values'],
    queryFn: async () => (await axios.get<ReferenceOptions>(`${API_BASE_URL}/reference-values`)).data,
    staleTime: 10 * 60_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['directory'] });
  const fail = (err: unknown) =>
    enqueueSnackbar(asApiError(err)?.message ?? 'Request failed', { variant: 'error' });

  const review = useMutation({
    mutationFn: async (input: { id: string; decision: 'approve' | 'reject'; reason?: string }) =>
      (await api.post(`/volunteers/${input.id}/${input.decision}`, { reason: input.reason })).data,
    onSuccess: (_result, input) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['volunteer-detail'] });
      setRejecting(null);
      setRejectReason('');
      enqueueSnackbar(
        input.decision === 'approve'
          ? 'Registration approved — the volunteer has been emailed'
          : 'Registration rejected — the account is now inactive',
        { variant: input.decision === 'approve' ? 'success' : 'warning' },
      );
    },
    onError: fail,
  });

  const setActive = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) =>
      (await api.patch(`/volunteers/${input.id}`, { isActive: input.isActive })).data,
    onSuccess: (_result, input) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['volunteer-detail'] });
      setDeactivating(null);
      enqueueSnackbar(input.isActive ? 'Volunteer activated' : 'Volunteer inactivated', {
        variant: input.isActive ? 'success' : 'warning',
      });
    },
    onError: fail,
  });

  const pending = data?.meta.pending ?? 0;

  return (
    <PageShell
      eyebrow="Admin › People"
      title="Volunteer Directory"
      description="Review new registrations, and activate or inactivate volunteers. Click any row to see everything the volunteer told us when they signed up."
      actions={
        pending > 0 ? (
          <Button
            variant={registrationStatus === 'pending' ? 'pill' : 'pillOutlined'}
            onClick={() => {
              setRegistrationStatus(registrationStatus === 'pending' ? 'all' : 'pending');
              setPage(0);
            }}
          >
            🔔 {pending} awaiting review
          </Button>
        ) : undefined
      }
    >
      <FilterBar
        search={{
          value: q,
          onChange: (v) => { setQ(v); setPage(0); },
          placeholder: 'Search name or email…',
        }}
        groups={[
          {
            label: 'Registration',
            value: registrationStatus,
            onChange: (v) => { setRegistrationStatus(v); setPage(0); },
            options: [
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ],
          },
          {
            label: 'Category',
            value: category,
            onChange: (v) => { setCategory(v); setPage(0); },
            options: [
              { value: 'all', label: 'All' },
              { value: 'Individual', label: 'Individual' },
              { value: 'CSR', label: 'CSR' },
            ],
          },
        ]}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Volunteer</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Registration</TableCell>
              <TableCell>Account</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.data ?? []).map((v) => (
              <TableRow
                key={v.id}
                hover
                onClick={() => setOpenId(v.id)}
                sx={{ cursor: 'pointer', opacity: v.isActive ? 1 : 0.6 }}
              >
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {v.firstName} {v.lastName}
                  </Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                    {v.organization ?? v.city ?? '—'} · registered {fmtDate(v.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: '0.85rem' }}>{v.email}</Typography>
                  {v.phone && (
                    <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                      {v.phone}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip label={v.category} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <StatusPill status={statusPill[v.registrationStatus]} />
                  {v.registrationStatus === 'rejected' && v.rejectionReason && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25, maxWidth: 200 }}>
                      {v.rejectionReason}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: v.isActive ? tokens.success : tokens.accentStrong,
                    }}
                  >
                    {v.isActive ? '● Active' : '○ Inactive'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                    {v.phase}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                  {v.registrationStatus === 'pending' ? (
                    <>
                      <Button
                        size="small"
                        variant="pill"
                        sx={{ px: 1.5, py: 0.3, mr: 0.5 }}
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: v.id, decision: 'approve' })}
                      >
                        ✓ Approve
                      </Button>
                      <Button
                        size="small"
                        variant="pillOutlined"
                        sx={{ px: 1.5, py: 0.3, color: tokens.accentStrong }}
                        onClick={() => { setRejecting(v); setRejectReason(''); }}
                      >
                        ✕ Reject
                      </Button>
                    </>
                  ) : v.isActive ? (
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.5, py: 0.3, color: tokens.accentStrong }}
                      onClick={() => setDeactivating(v)}
                    >
                      Inactivate
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.5, py: 0.3 }}
                      disabled={setActive.isPending}
                      onClick={() => setActive.mutate({ id: v.id, isActive: true })}
                    >
                      Activate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {data && data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No volunteers match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <TablePagination
          component="div"
          count={data?.meta.total ?? 0}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={limit}
          rowsPerPageOptions={[limit]}
        />
      </Box>

      <VolunteerDetailDrawer
        id={openId}
        options={options}
        onClose={() => setOpenId(null)}
        onApprove={(id) => review.mutate({ id, decision: 'approve' })}
        onReject={(row) => { setOpenId(null); setRejecting(row); setRejectReason(''); }}
        busy={review.isPending}
      />

      {/* Rejection needs a reason — the volunteer is told what it was. */}
      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        PaperProps={{ sx: { borderRadius: 4, width: 480, maxWidth: '100%' } }}
      >
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Reject {rejecting?.firstName} {rejecting?.lastName}?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2 }}>
            This deactivates the account so they can no longer sign in, and emails them your
            reason. You can activate them again later if this was a mistake.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Reason for rejection"
            placeholder="e.g. Duplicate of an existing volunteer record."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setRejecting(null)}>
            Cancel
          </Button>
          <Button
            variant="pill"
            disabled={rejectReason.trim().length === 0 || review.isPending}
            onClick={() =>
              rejecting &&
              review.mutate({ id: rejecting.id, decision: 'reject', reason: rejectReason.trim() })
            }
          >
            {review.isPending ? 'Rejecting…' : 'Reject registration'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deactivating !== null}
        title={`Inactivate ${deactivating?.firstName ?? ''} ${deactivating?.lastName ?? ''}?`}
        message="They will not be able to sign in, and will stop appearing as an available volunteer. Their history, hours and certificates are kept, and you can activate them again at any time."
        confirmLabel="Inactivate"
        danger
        onConfirm={() => deactivating && setActive.mutate({ id: deactivating.id, isActive: false })}
        onCancel={() => setDeactivating(null)}
      />
    </PageShell>
  );
}

/** Everything the volunteer told us at sign-up, for the approve/reject call. */
function VolunteerDetailDrawer({
  id,
  options,
  onClose,
  onApprove,
  onReject,
  busy,
}: {
  id: string | null;
  options: ReferenceOptions;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (row: DirectoryRow) => void;
  busy: boolean;
}) {
  const { data: v } = useQuery({
    queryKey: ['volunteer-detail', id],
    queryFn: async () => (await api.get<VolunteerDetail>(`/volunteers/${id}`)).data,
    enabled: id !== null,
  });

  // Codes are stored; labels are looked up so a relabelled option reads correctly.
  const labelsFor = (category: string, codes: string | null): string[] => {
    if (!codes) return [];
    const catalog = options[category] ?? [];
    return codes
      .split(',')
      .map((code) => catalog.find((o) => o.code === code)?.label ?? code);
  };

  return (
    <Drawer
      anchor="right"
      open={id !== null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 3 } }}
    >
      {v && (
        <Box>
          <Typography variant="overline" sx={{ color: tokens.accentStrong }}>
            {v.category === 'CSR' ? 'CSR volunteer' : 'Individual volunteer'}
          </Typography>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            {v.firstName} {v.lastName}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
            <StatusPill status={statusPill[v.registrationStatus]} />
            <Typography
              sx={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: v.isActive ? tokens.success : tokens.accentStrong,
              }}
            >
              {v.isActive ? '● Active' : '○ Inactive'}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{v.phase}</Typography>
          </Box>

          {v.registrationStatus === 'pending' && (
            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 3, mb: 2, bgcolor: 'rgba(217,108,63,0.08)' }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1 }}>
                This registration is awaiting your review
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="pill"
                  size="small"
                  sx={{ px: 2 }}
                  disabled={busy}
                  onClick={() => onApprove(v.id)}
                >
                  ✓ Approve
                </Button>
                <Button
                  variant="pillOutlined"
                  size="small"
                  sx={{ px: 2, color: tokens.accentStrong }}
                  onClick={() => onReject(v as unknown as DirectoryRow)}
                >
                  ✕ Reject
                </Button>
              </Box>
            </Paper>
          )}

          {v.registrationStatus === 'rejected' && v.rejectionReason && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'text.secondary', fontWeight: 700 }}>
                Rejected
              </Typography>
              <Typography sx={{ fontSize: '0.9rem' }}>{v.rejectionReason}</Typography>
            </Paper>
          )}

          <Section title="Contact">
            <Field label="Email" value={v.email} />
            <Field label="Phone" value={v.phone} />
            <Field label="City" value={[v.city, v.state].filter(Boolean).join(', ') || null} />
          </Section>

          <Section title="About">
            <Field label="Date of birth" value={v.dateOfBirth ? fmtDate(v.dateOfBirth) : null} />
            <Field label="Gender" value={v.gender} />
            <Field label="Occupation" value={v.occupation} />
            {v.organization && <Field label="Organization" value={v.organization.name} />}
          </Section>

          <Section title="How they would like to help">
            <ChipRow labels={labelsFor('AREA_OF_INTEREST', v.areasOfInterest)} empty="No areas selected" />
            <Field label="Languages" value={labelsFor('LANGUAGE', v.languages).join(', ') || null} />
            <Field
              label="Availability"
              value={labelsFor('AVAILABILITY', v.availability).join(', ') || null}
            />
            <Field label="Availability notes" value={v.availabilityNotes} />
            <Field label="Skills" value={v.skills} />
          </Section>

          <Section title="Standing">
            <Field label="Compliance report read" value={v.consentSigned ? 'Consent signed' : 'Consent not signed'} />
            <Field
              label="Contribution"
              value={`${Number(v.participation.total_hours)} hours · ${v.participation.events_attended} session(s) · ${v.participation.programs} programme(s)`}
            />
            <Field label="Registered" value={fmtDate(v.createdAt)} />
            {v.reviewedAt && (
              <Field
                label="Reviewed"
                value={`${fmtDate(v.reviewedAt)}${v.reviewedByEmail ? ` by ${v.reviewedByEmail}` : ''}`}
              />
            )}
          </Section>

          <Button variant="pillOutlined" fullWidth sx={{ mt: 2 }} onClick={onClose}>
            Close
          </Button>
        </Box>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        sx={{
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          color: tokens.accentStrong,
        }}
      >
        {title}
      </Typography>
      <Divider sx={{ mb: 1 }} />
      {children}
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.35 }}>
      <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', minWidth: 130 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.88rem', flex: 1 }}>{value ?? '—'}</Typography>
    </Box>
  );
}

function ChipRow({ labels, empty }: { labels: string[]; empty: string }) {
  if (labels.length === 0) {
    return <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', py: 0.5 }}>{empty}</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', py: 0.5 }}>
      {labels.map((label) => (
        <Chip key={label} label={label} size="small" sx={{ height: 22, fontSize: '0.74rem' }} />
      ))}
    </Box>
  );
}
