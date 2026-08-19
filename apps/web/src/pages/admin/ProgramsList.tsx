import { Box, Button, Paper, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { usePrograms } from '@/api/admin';
import { EmptyState, FilterBar, PageShell, StatusPill } from '@/components';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ProgramsList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const navigate = useNavigate();
  const { data: programs = [], isLoading } = usePrograms(q, status);

  return (
    <PageShell
      eyebrow="Admin › Programs"
      title="Programs"
      actions={
        <Button component={RouterLink} to="/admin/programs/new" variant="pill">
          + New Program
        </Button>
      }
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search programs…' }}
        groups={[
          {
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Draft' },
              { value: 'discontinued', label: 'Discontinued' },
            ],
          },
        ]}
      />

      {!isLoading && programs.length === 0 && (
        <EmptyState message="No programs match your filters." />
      )}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {programs.map((p) => (
          <Paper
            key={p.id}
            variant="outlined"
            onClick={() => navigate(`/admin/programs/${p.id}`)}
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              transition: 'box-shadow 160ms ease, transform 160ms ease',
              opacity: p.status === 'discontinued' ? 0.65 : 1,
              '&:hover': { boxShadow: '0 8px 24px rgba(19,35,37,0.10)', transform: 'translateY(-1px)' },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontFamily: '"Source Serif 4", Georgia, serif', fontSize: '1.2rem', fontWeight: 600 }}>
                    {p.name}
                  </Typography>
                  <StatusPill status={p.status} />
                </Box>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', mt: 0.25 }}>
                  {p.code}
                  {p.defaultCoordinator ? ` · default coordinator: ${p.defaultCoordinator.name}` : ''}
                </Typography>
                {p.description && (
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mt: 0.5, maxWidth: '52rem' }}>
                    {p.description}
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                  {p.activeActivities} activit{p.activeActivities === 1 ? 'y' : 'ies'} ·{' '}
                  {p.upcomingEvents} upcoming session{p.upcomingEvents === 1 ? '' : 's'}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mt: 0.25 }}>
                  next: {fmtDate(p.nextEventDate)}
                </Typography>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>
    </PageShell>
  );
}
