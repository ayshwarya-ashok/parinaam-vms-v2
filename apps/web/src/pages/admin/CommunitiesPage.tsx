import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunities, type CommunityRow } from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { useToast } from '@/app/toast';
import { EmptyState, FilterBar, PageShell } from '@/components';

interface CommunityFormState {
  id: string | null;
  name: string;
  description: string;
  city: string;
}

const emptyForm: CommunityFormState = { id: null, name: '', description: '', city: '' };

/**
 * Beneficiary communities — the places sessions serve. Every published
 * session must link to at least one, so this master list is where that
 * catalog is maintained. Archive, never delete: session links are history.
 */
export function CommunitiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [showArchived, setShowArchived] = useState('active');
  const { data: communities = [], isLoading } = useCommunities(showArchived === 'all');

  const [form, setForm] = useState<CommunityFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['communities'] });

  const save = useMutation({
    mutationFn: async (f: CommunityFormState) => {
      const body = {
        name: f.name.trim(),
        description: f.description.trim() || undefined,
        city: f.city.trim() || undefined,
      };
      if (f.id) return api.patch(`/communities/${f.id}`, body);
      return api.post('/communities', body);
    },
    onSuccess: (_, f) => {
      toast.success(f.id ? 'Community updated' : 'Community created');
      setForm(null);
      void invalidate();
    },
    onError: (err) => setFormError(asApiError(err)?.message ?? 'Could not save.'),
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: 'active' | 'archived' }) =>
      api.patch(`/communities/${args.id}`, { status: args.status }),
    onSuccess: (_, args) => {
      toast.success(args.status === 'archived' ? 'Community archived' : 'Community restored');
      void invalidate();
    },
    onError: (err) => toast.failure(asApiError(err)?.message ?? 'Could not update.'),
  });

  const openEdit = (c: CommunityRow) =>
    setForm({ id: c.id, name: c.name, description: c.description ?? '', city: c.city ?? '' });

  return (
    <PageShell
      title="Beneficiary Communities"
      description="The communities Parinaam serves. Every published session must be linked to at least one — link sessions when scheduling or editing them."
      actions={
        <Button variant="pill" onClick={() => setForm({ ...emptyForm })}>
          + New community
        </Button>
      }
    >
      <FilterBar
        groups={[
          {
            label: 'Show',
            value: showArchived,
            onChange: setShowArchived,
            options: [
              { value: 'active', label: 'Active' },
              { value: 'all', label: 'Including archived' },
            ],
          },
        ]}
      />

      {!isLoading && communities.length === 0 && (
        <EmptyState message="No communities yet — create the first one." />
      )}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {communities.map((c) => (
          <Paper
            key={c.id}
            variant="outlined"
            onClick={() => navigate(`/admin/communities/${c.id}`)}
            sx={{
              p: 2,
              borderRadius: 4,
              cursor: 'pointer',
              bgcolor: 'rgba(255,252,247,0.8)',
              opacity: c.status === 'archived' ? 0.65 : 1,
              transition: 'box-shadow 160ms ease',
              '&:hover': { boxShadow: '0 12px 24px rgba(19,35,37,0.10)' },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{c.name}</Typography>
                  {c.status === 'archived' && <Chip size="small" label="Archived" />}
                </Box>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem' }}>
                  {c.city ?? '—'}
                  {c.description ? ` · ${c.description}` : ''}
                </Typography>
              </Box>
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}
              >
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                  {c.upcoming_sessions} upcoming · {c.completed_sessions} completed
                  {c.draft_sessions > 0 ? ` · ${c.draft_sessions} draft` : ''}
                </Typography>
                <Button size="small" variant="pillOutlined" onClick={() => openEdit(c)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="pillOutlined"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      id: c.id,
                      status: c.status === 'archived' ? 'active' : 'archived',
                    })
                  }
                >
                  {c.status === 'archived' ? 'Restore' : 'Archive'}
                </Button>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={form !== null} onClose={() => setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? 'Edit community' : 'New community'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {formError && (
            <Typography sx={{ color: 'error.main', fontSize: '0.88rem' }}>{formError}</Typography>
          )}
          <TextField
            label="Name"
            required
            value={form?.name ?? ''}
            onChange={(e) => {
              setFormError(null);
              setForm((f) => (f ? { ...f, name: e.target.value } : f));
            }}
          />
          <TextField
            label="City"
            value={form?.city ?? ''}
            onChange={(e) => setForm((f) => (f ? { ...f, city: e.target.value } : f))}
          />
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
            disabled={save.isPending || !form?.name.trim()}
            onClick={() => form && save.mutate(form)}
          >
            {form?.id ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
