import { Box, Chip, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useCommunitySessions } from '@/api/admin';
import { api } from '@/api/client';
import { EmptyState, FilterBar, PageShell, StatusPill } from '@/components';

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** One community: what it is, and every session that serves it, by status. */
export function CommunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState('all');

  const { data: community } = useQuery({
    queryKey: ['community', id],
    queryFn: async () =>
      (
        await api.get<{
          id: string;
          name: string;
          description: string | null;
          city: string | null;
          status: 'active' | 'archived';
        }>(`/communities/${id}`)
      ).data,
    enabled: !!id,
  });

  const { data: sessions = [], isLoading } = useCommunitySessions(
    id,
    status === 'all' ? undefined : status,
  );

  if (!community) {
    return (
      <PageShell title="Community">
        <span />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={community.name}
      description={[community.city, community.description].filter(Boolean).join(' · ') || undefined}
      actions={community.status === 'archived' ? <Chip label="Archived" /> : undefined}
    >
      <FilterBar
        groups={[
          {
            label: 'Sessions',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'inprogress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'draft', label: 'Draft' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
          },
        ]}
      />

      {!isLoading && sessions.length === 0 && (
        <EmptyState message="No sessions for this community match the filter." />
      )}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {sessions.map((s) => (
          <Paper
            key={s.id}
            variant="outlined"
            component={RouterLink}
            to={`/admin/sessions/${s.id}`}
            sx={{
              p: 2,
              borderRadius: 4,
              bgcolor: 'rgba(255,255,255,0.8)',
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              transition: 'box-shadow 160ms ease',
              '&:hover': { boxShadow: '0 12px 24px rgba(31,43,54,0.10)' },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'secondary.dark' }}>
                {s.program_name} · {s.activity_name}
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>{s.name}</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                {s.code} · {fmtDate(s.date)} at {String(s.start_time).slice(0, 5)} ·{' '}
                {s.location ?? 'Location TBC'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                {s.enrolled_count}/{s.max_slots} enrolled
              </Typography>
              <StatusPill status={s.status} />
            </Box>
          </Paper>
        ))}
      </Box>

      <Typography sx={{ mt: 1.5, fontSize: '0.82rem', color: 'text.secondary' }}>
        Showing {sessions.length} session{sessions.length === 1 ? '' : 's'}
      </Typography>
    </PageShell>
  );
}
