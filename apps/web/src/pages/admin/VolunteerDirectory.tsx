import {
  Box,
  Chip,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api } from '@/api/client';
import { FilterBar, PageShell, StatusPill } from '@/components';

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
  createdAt: string;
}

const phasePill: Record<DirectoryRow['phase'], 'draft' | 'pending' | 'active' | 'cancelled'> = {
  Onboarding: 'draft',
  'In Training': 'pending',
  Active: 'active',
  Inactive: 'cancelled',
};

/** Q1 — the admin volunteer directory the prototype stubbed. */
export function VolunteerDirectory() {
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const limit = 25;

  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data } = useQuery({
    queryKey: ['directory', q, phase, category, page],
    queryFn: async () =>
      (
        await api.get<{ data: DirectoryRow[]; meta: { total: number } }>('/volunteers', {
          params: {
            q: q || undefined,
            phase: phase === 'all' ? undefined : phase,
            category: category === 'all' ? undefined : category,
            limit,
            offset: page * limit,
          },
        })
      ).data,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await api.patch(`/volunteers/${id}`, { isActive })).data,
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['directory'] });
      enqueueSnackbar(vars.isActive ? 'Account activated' : 'Account deactivated', {
        variant: vars.isActive ? 'success' : 'warning',
      });
    },
  });

  return (
    <PageShell
      eyebrow="Admin › People"
      title="Volunteer Directory"
      description="Search, filter by lifecycle phase, and activate or deactivate accounts. Phases are derived from consent and compliance — override only when correcting data."
    >
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(0); }, placeholder: 'Search name or email…' }}
        groups={[
          {
            label: 'Phase',
            value: phase,
            onChange: (v) => { setPhase(v); setPage(0); },
            options: [
              { value: 'all', label: 'All' },
              { value: 'Onboarding', label: 'Onboarding' },
              { value: 'In Training', label: 'In Training' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
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
              <TableCell>City</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Phase</TableCell>
              <TableCell align="center">Login enabled</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.data ?? []).map((v) => (
              <TableRow key={v.id} sx={{ opacity: v.isActive ? 1 : 0.55 }}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {v.firstName} {v.lastName}
                  </Typography>
                  {v.organization && (
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                      {v.organization}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: '0.85rem' }}>{v.email}</Typography>
                  {v.phone && (
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                      {v.phone}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{v.city ?? '—'}</TableCell>
                <TableCell>
                  <Chip label={v.category} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <StatusPill status={phasePill[v.phase]} />
                  <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 0.5 }}>
                    {v.phase}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Switch
                    size="small"
                    checked={v.isActive}
                    onChange={(e) => toggleActive.mutate({ id: v.id, isActive: e.target.checked })}
                  />
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
    </PageShell>
  );
}
