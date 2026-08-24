import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import { useToast } from '@/app/toast';
import { StatusPill } from '@/components';
import { tokens } from '@/theme';

export interface PhaseRow {
  id: string;
  name: string;
  description: string | null;
  responsibility: 'parinaam' | 'partner' | 'collab';
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'inprogress' | 'completed';
  partner_lead_volunteer_id: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  parinaam_marked_at: string | null;
  partner_marked_at: string | null;
  overridden_at: string | null;
  override_reason: string | null;
  sort_order: number;
}

const RESPONSIBILITY_LABEL: Record<PhaseRow['responsibility'], string> = {
  parinaam: 'Parinaam team',
  partner: 'Partner / volunteer',
  collab: 'Parinaam + partner',
};

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

interface PhaseFormState {
  id: string | null;
  name: string;
  description: string;
  responsibility: PhaseRow['responsibility'];
  startDate: string;
  endDate: string;
  partnerLeadVolunteerId: string;
}

const emptyPhase: PhaseFormState = {
  id: null,
  name: '',
  description: '',
  responsibility: 'parinaam',
  startDate: '',
  endDate: '',
  partnerLeadVolunteerId: '',
};

/**
 * The session's phase board. Completing every phase completes the session;
 * a knocked-back phase reverts it. Partner-owned phases are marked by their
 * named lead — the admin's tool for those is the audited override.
 */
export function PhasesPanel({
  eventId,
  eventStatus,
  phases,
}: {
  eventId: string;
  eventStatus: string;
  phases: PhaseRow[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<PhaseFormState | null>(null);
  const [override, setOverride] = useState<{
    phase: PhaseRow;
    status: PhaseRow['status'];
    reason: string;
  } | null>(null);

  const editable = eventStatus !== 'cancelled' && eventStatus !== 'completed';

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['session-record', eventId] });
    void queryClient.invalidateQueries({ queryKey: ['event-admin', eventId] });
    void queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    void queryClient.invalidateQueries({ queryKey: ['programs'] });
    void queryClient.invalidateQueries({ queryKey: ['communities'] });
  };

  const { data: volunteers = [] } = useQuery({
    queryKey: ['walk-in-candidates'],
    queryFn: async () =>
      (
        await api.get<{
          data: Array<{ id: string; firstName: string; lastName: string; email: string }>;
        }>('/volunteers', { params: { registrationStatus: 'approved', limit: 100 } })
      ).data.data,
    enabled: form !== null,
  });

  const save = useMutation({
    mutationFn: async (f: PhaseFormState) => {
      const body = {
        name: f.name.trim(),
        description: f.description.trim() || undefined,
        responsibility: f.responsibility,
        startDate: f.startDate,
        endDate: f.endDate || undefined,
        partnerLeadVolunteerId: f.partnerLeadVolunteerId || undefined,
      };
      if (f.id) {
        return api.patch(`/phases/${f.id}`, {
          ...body,
          endDate: f.endDate || f.startDate,
          partnerLeadVolunteerId: f.partnerLeadVolunteerId,
        });
      }
      return api.post(`/events/${eventId}/phases`, body);
    },
    onSuccess: (_, f) => {
      toast.success(f.id ? 'Phase updated' : 'Phase added');
      setForm(null);
      invalidate();
    },
    onError: (err) => toast.failure(asApiError(err)?.message ?? 'Could not save the phase.'),
  });

  const act = useMutation({
    mutationFn: async (args: { phaseId: string; action: 'start' | 'complete' | 'delete' }) => {
      if (args.action === 'delete') return api.delete(`/phases/${args.phaseId}`);
      return api.post(`/phases/${args.phaseId}/${args.action}`);
    },
    onSuccess: (_, args) => {
      toast.success(
        args.action === 'start'
          ? 'Phase started'
          : args.action === 'complete'
            ? 'Parinaam side marked complete'
            : 'Phase removed',
      );
      invalidate();
    },
    onError: (err) => toast.failure(asApiError(err)?.message ?? 'Could not update the phase.'),
  });

  const doOverride = useMutation({
    mutationFn: async (o: { phase: PhaseRow; status: PhaseRow['status']; reason: string }) =>
      api.post(`/phases/${o.phase.id}/override`, { status: o.status, reason: o.reason.trim() }),
    onSuccess: () => {
      toast.success('Phase status overridden');
      setOverride(null);
      invalidate();
    },
    onError: (err) => toast.failure(asApiError(err)?.message ?? 'Could not override.'),
  });

  const done = phases.filter((p) => p.status === 'completed').length;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>
            Phases{phases.length > 0 ? ` — ${done}/${phases.length} complete` : ''}
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
            {phases.length === 0
              ? 'No phases — this session uses the single-day lifecycle with the manual "Mark completed" action. Adding a phase switches it to phase-driven completion.'
              : 'The session completes automatically when every phase is complete. Overrides are audited; knocking a phase back reverts the session.'}
          </Typography>
        </Box>
        {editable && (
          <Button size="small" variant="pillOutlined" onClick={() => setForm({ ...emptyPhase })}>
            + Add phase
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'grid', gap: 1 }}>
        {phases.map((p) => {
          const leadName = p.lead_first_name ? `${p.lead_first_name} ${p.lead_last_name}` : null;
          const singleDay = String(p.start_date).slice(0, 10) === String(p.end_date).slice(0, 10);
          return (
            <Box
              key={p.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
                p: 1.5,
                borderRadius: 2.5,
                border: '1px solid rgba(19,35,37,0.1)',
                bgcolor: 'rgba(255,252,247,0.7)',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</Typography>
                  <StatusPill status={p.status} />
                  {p.overridden_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label="overridden"
                      title={p.override_reason ?? undefined}
                      sx={{ fontSize: '0.68rem', color: tokens.accentStrong }}
                    />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                  {singleDay
                    ? fmtDate(p.start_date)
                    : `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`}{' '}
                  · {RESPONSIBILITY_LABEL[p.responsibility]}
                  {leadName ? ` · lead: ${leadName}` : ''}
                </Typography>
                {p.responsibility === 'collab' && p.status !== 'completed' && (
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    Parinaam {p.parinaam_marked_at ? '✓' : '…'} · Partner{' '}
                    {p.partner_marked_at ? '✓' : '…'}
                  </Typography>
                )}
              </Box>

              {editable && (
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, flexWrap: 'wrap' }}>
                  {p.status === 'upcoming' && (
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.5, py: 0.25 }}
                      disabled={act.isPending}
                      onClick={() => act.mutate({ phaseId: p.id, action: 'start' })}
                    >
                      Start
                    </Button>
                  )}
                  {p.responsibility !== 'partner' &&
                    p.status !== 'completed' &&
                    !p.parinaam_marked_at && (
                      <Button
                        size="small"
                        variant="pill"
                        sx={{ px: 1.5, py: 0.25 }}
                        disabled={act.isPending}
                        onClick={() => act.mutate({ phaseId: p.id, action: 'complete' })}
                      >
                        ✓ {p.responsibility === 'collab' ? 'Parinaam side done' : 'Mark complete'}
                      </Button>
                    )}
                  {p.status !== 'completed' && (
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.5, py: 0.25 }}
                      onClick={() =>
                        setForm({
                          id: p.id,
                          name: p.name,
                          description: p.description ?? '',
                          responsibility: p.responsibility,
                          startDate: String(p.start_date).slice(0, 10),
                          endDate: String(p.end_date).slice(0, 10),
                          partnerLeadVolunteerId: p.partner_lead_volunteer_id ?? '',
                        })
                      }
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="pillOutlined"
                    sx={{ px: 1.5, py: 0.25 }}
                    onClick={() => setOverride({ phase: p, status: p.status, reason: '' })}
                  >
                    Override
                  </Button>
                  {p.status === 'upcoming' && !p.parinaam_marked_at && !p.partner_marked_at && (
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.5, py: 0.25, color: tokens.accentStrong }}
                      disabled={act.isPending}
                      onClick={() => act.mutate({ phaseId: p.id, action: 'delete' })}
                    >
                      Remove
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* ── Add / edit phase ──────────────────────────────────────────────── */}
      <Dialog open={form !== null} onClose={() => setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? 'Edit phase' : 'Add phase'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <TextField
            label="Phase name"
            required
            value={form?.name ?? ''}
            onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
          />
          <TextField
            select
            label="Responsibility"
            value={form?.responsibility ?? 'parinaam'}
            onChange={(e) =>
              setForm((f) =>
                f ? { ...f, responsibility: e.target.value as PhaseRow['responsibility'] } : f,
              )
            }
            helperText="Who marks this phase complete. Collaboration needs both sides."
          >
            <MenuItem value="parinaam">Parinaam team</MenuItem>
            <MenuItem value="partner">Partner / volunteer only</MenuItem>
            <MenuItem value="collab">Parinaam + partner together</MenuItem>
          </TextField>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Start date"
              type="date"
              required
              InputLabelProps={{ shrink: true }}
              value={form?.startDate ?? ''}
              onChange={(e) => setForm((f) => (f ? { ...f, startDate: e.target.value } : f))}
            />
            <TextField
              label="End date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={form?.endDate ?? ''}
              onChange={(e) => setForm((f) => (f ? { ...f, endDate: e.target.value } : f))}
              helperText="Blank = single-day phase"
            />
          </Box>
          {form?.responsibility !== 'parinaam' && (
            <TextField
              select
              label="Partner lead"
              value={form?.partnerLeadVolunteerId ?? ''}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, partnerLeadVolunteerId: e.target.value } : f))
              }
              helperText="The named volunteer who marks the partner side complete"
            >
              <MenuItem value="">— none yet —</MenuItem>
              {volunteers.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.firstName} {v.lastName} — {v.email}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={form?.description ?? ''}
            onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setForm(null)}>
            Cancel
          </Button>
          <Button
            variant="pill"
            disabled={save.isPending || !form?.name.trim() || !form?.startDate}
            onClick={() => form && save.mutate(form)}
          >
            {form?.id ? 'Save' : 'Add phase'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Override ──────────────────────────────────────────────────────── */}
      <Dialog open={override !== null} onClose={() => setOverride(null)} fullWidth maxWidth="xs">
        <DialogTitle>Override "{override?.phase.name}"</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
            The override wins over completion marks and is written to the audit log. Overriding
            back to upcoming clears both marks; knocking back the last completed phase reverts the
            whole session.
          </Typography>
          <TextField
            select
            label="New status"
            value={override?.status ?? 'upcoming'}
            onChange={(e) =>
              setOverride((o) =>
                o ? { ...o, status: e.target.value as PhaseRow['status'] } : o,
              )
            }
          >
            <MenuItem value="upcoming">Upcoming</MenuItem>
            <MenuItem value="inprogress">In progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </TextField>
          <TextField
            label="Reason"
            required
            multiline
            minRows={2}
            value={override?.reason ?? ''}
            onChange={(e) => setOverride((o) => (o ? { ...o, reason: e.target.value } : o))}
            helperText="Required — this goes into the audit trail"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setOverride(null)}>
            Cancel
          </Button>
          <Button
            variant="pill"
            disabled={doOverride.isPending || !override?.reason.trim()}
            onClick={() => override && doOverride.mutate(override)}
          >
            Override
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
