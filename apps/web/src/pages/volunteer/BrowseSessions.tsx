import { Box, Typography } from '@mui/material';
import { useState } from 'react';
import { useSessions } from '@/api/volunteer';
import { EmptyState, FilterBar, PageShell } from '@/components';
import { useEnrollFlow } from '@/components/EnrollFlow';
import { SessionCard } from '@/components/SessionCard';

export function BrowseSessions() {
  const [view, setView] = useState('upcoming');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [enrollState, setEnrollState] = useState('all');
  const [mine, setMine] = useState('all');
  const [sort, setSort] = useState('date');

  const showingCompleted = view === 'completed';

  const { data: sessions = [], isLoading } = useSessions({
    q: q || undefined,
    type: type === 'all' ? undefined : type,
    enrollState: showingCompleted || enrollState === 'all' ? undefined : enrollState,
    sort,
    scope: showingCompleted ? 'completed' : 'open',
  });

  const visible = showingCompleted
    ? mine === 'mine'
      ? sessions.filter((s) => s.myState === 'enrolled' || s.myAttendance !== null)
      : sessions
    : sessions;

  const { onEnroll, onWithdraw, onLeaveWaitlist, dialogs } = useEnrollFlow();

  return (
    <PageShell
      title={showingCompleted ? 'Completed Sessions' : 'Browse Sessions'}
      description={
        showingCompleted
          ? 'Sessions that have run. "My sessions" narrows to the ones you were enrolled in or attended.'
          : 'Enroll in upcoming volunteer sessions. Sessions marked 🔒 need trainings completed first — the union of program-level and activity-level requirements.'
      }
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search sessions…' }}
        groups={[
          {
            label: 'View',
            value: view,
            onChange: setView,
            options: [
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'completed', label: 'Completed' },
            ],
          },
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
          showingCompleted
            ? {
                label: 'Show',
                value: mine,
                onChange: setMine,
                options: [
                  { value: 'all', label: 'All sessions' },
                  { value: 'mine', label: 'My sessions' },
                ],
              }
            : {
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

      {!isLoading && visible.length === 0 && (
        <EmptyState
          message={
            showingCompleted && mine === 'mine'
              ? 'No completed sessions with your enrollment or attendance yet.'
              : 'No sessions match your filters.'
          }
        />
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        {visible.map((session) => (
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
        Showing {visible.length} session{visible.length === 1 ? '' : 's'}
      </Typography>

      {dialogs}
    </PageShell>
  );
}
