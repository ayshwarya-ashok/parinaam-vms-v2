import { Box, Typography } from '@mui/material';
import { useState } from 'react';
import { useSessions } from '@/api/volunteer';
import { EmptyState, FilterBar, PageShell } from '@/components';
import { useEnrollFlow } from '@/components/EnrollFlow';
import { SessionCard } from '@/components/SessionCard';

export function BrowseSessions() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [enrollState, setEnrollState] = useState('all');
  const [sort, setSort] = useState('date');

  const { data: sessions = [], isLoading } = useSessions({
    q: q || undefined,
    type: type === 'all' ? undefined : type,
    enrollState: enrollState === 'all' ? undefined : enrollState,
    sort,
    scope: 'open',
  });

  const { onEnroll, onWithdraw, onLeaveWaitlist, dialogs } = useEnrollFlow();

  return (
    <PageShell
      eyebrow="Volunteer › Sessions"
      title="Browse Sessions"
      description="Enroll in upcoming volunteer sessions. Sessions marked 🔒 need trainings completed first — the union of program-level and activity-level requirements."
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search sessions…' }}
        groups={[
          {
            label: 'Sort',
            value: sort,
            onChange: setSort,
            options: [
              { value: 'date', label: 'Date' },
              { value: 'time', label: 'Time' },
              { value: 'venue', label: 'Venue' },
              { value: 'slots', label: 'Slots' },
            ],
          },
          {
            label: 'Type',
            value: type,
            onChange: setType,
            options: [
              { value: 'all', label: 'All' },
              { value: 'In person', label: 'In Person' },
              { value: 'Online', label: 'Online' },
            ],
          },
          {
            label: 'Status',
            value: enrollState,
            onChange: setEnrollState,
            options: [
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'waitlist', label: 'Waitlist' },
              { value: 'enrolled', label: 'My enrollments' },
            ],
          },
        ]}
      />

      {!isLoading && sessions.length === 0 && (
        <EmptyState message="No sessions match your filters." />
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onEnroll={onEnroll}
            onWithdraw={onWithdraw}
            onLeaveWaitlist={onLeaveWaitlist}
          />
        ))}
      </Box>

      <Typography sx={{ mt: 1.5, fontSize: '0.82rem', color: 'text.secondary' }}>
        Showing {sessions.length} session{sessions.length === 1 ? '' : 's'}
      </Typography>

      {dialogs}
    </PageShell>
  );
}
