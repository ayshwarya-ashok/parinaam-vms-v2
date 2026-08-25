import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Box, Button, Chip, LinearProgress, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import type { SessionRow } from '@/api/volunteer';
import { tokens } from '@/theme';

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

interface SessionCardProps {
  session: SessionRow;
  onEnroll: (session: SessionRow) => void;
  onWithdraw: (session: SessionRow) => void;
  onLeaveWaitlist: (session: SessionRow) => void;
}

/**
 * The prototype's activity card: slot bar with open/warn/full colouring, the
 * six button states, training-lock and conflict badges.
 */
export function SessionCard({ session, onEnroll, onWithdraw, onLeaveWaitlist }: SessionCardProps) {
  const navigate = useNavigate();
  const { capacity } = session;
  const pct = Math.min(100, Math.round((capacity.enrolled / capacity.maxSlots) * 100));
  const barColor = pct >= 100 ? tokens.accentStrong : pct >= 75 ? tokens.accent : tokens.success;
  const locked = session.prereqsMet === false;
  const full = capacity.spotsLeft === 0 && session.myState === 'none';
  const completed = session.status === 'completed';

  let action: React.ReactNode;
  if (completed) {
    const label =
      session.myAttendance === 'present'
        ? `✓ You attended${session.myHours ? ` — ${session.myHours}h` : ''}`
        : session.myAttendance === 'absent'
          ? 'You were marked absent'
          : session.myState === 'enrolled'
            ? 'You were enrolled — attendance not recorded'
            : 'Session completed';
    action = (
      <Button
        fullWidth
        disabled
        variant="pillOutlined"
        sx={
          session.myAttendance === 'present'
            ? { color: `${tokens.success} !important`, borderColor: alpha(tokens.success, 0.4) }
            : undefined
        }
      >
        {label}
      </Button>
    );
  } else if (!session.isEnrollable && session.myState === 'none') {
    action = (
      <Button fullWidth disabled variant="pillOutlined">
        Not open for enrollment
      </Button>
    );
  } else if (session.myState === 'enrolled') {
    action = (
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        <Button fullWidth disabled variant="pillOutlined" sx={{ color: `${tokens.success} !important`, borderColor: alpha(tokens.success, 0.4) }}>
          ✓ Enrolled
        </Button>
        <Button fullWidth size="small" variant="pillOutlined" onClick={() => onWithdraw(session)}>
          Withdraw
        </Button>
      </Box>
    );
  } else if (session.myState === 'waitlisted') {
    action = (
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        <Button fullWidth disabled variant="pillOutlined" sx={{ color: `${tokens.info} !important`, borderColor: alpha(tokens.info, 0.4) }}>
          ⏳ On waitlist #{session.waitlistPosition}
        </Button>
        <Button fullWidth size="small" variant="pillOutlined" onClick={() => onLeaveWaitlist(session)}>
          Leave waitlist
        </Button>
      </Box>
    );
  } else if (locked) {
    action = (
      <Button fullWidth disabled variant="pillOutlined">
        🔒 Training required
      </Button>
    );
  } else if (full) {
    action = (
      <Button fullWidth variant="pillOutlined" sx={{ color: tokens.info, borderColor: alpha(tokens.info, 0.4) }} onClick={() => onEnroll(session)}>
        Join waitlist
      </Button>
    );
  } else {
    action = (
      <Button fullWidth variant="pill" onClick={() => onEnroll(session)}>
        Enroll now{capacity.spotsLeft <= 2 ? ` — ${capacity.spotsLeft} left!` : ''}
      </Button>
    );
  }

  return (
    <Paper
      variant="outlined"
      onClick={() => navigate(`/app/events/${session.id}`)}
      sx={{
        p: 2,
        borderRadius: 4,
        bgcolor: 'rgba(255,255,255,0.8)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        transition: 'box-shadow 160ms ease',
        '&:hover': { boxShadow: '0 12px 24px rgba(31,43,54,0.10)' },
      }}
    >
      <Box>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'secondary.dark' }}>
          {session.program.name}
        </Typography>
        <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.3 }}>
          {session.name}
        </Typography>
      </Box>

      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
        🗓 {fmtDate(session.date)} · {session.startTime} ({session.durationHours}h)
        <br />📍 {session.location ?? 'Location TBC'} · {session.type}
      </Typography>

      <Box>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6,
            borderRadius: 999,
            bgcolor: 'rgba(31,43,54,0.08)',
            '& .MuiLinearProgress-bar': { bgcolor: barColor, borderRadius: 999 },
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            {capacity.enrolled}/{capacity.maxSlots} filled
            {capacity.waitlisted > 0 ? ` · ${capacity.waitlisted} waiting` : ''}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: completed ? 'text.secondary' : full ? tokens.accentStrong : tokens.success,
            }}
          >
            {completed ? 'Completed' : full ? 'Full' : `${capacity.spotsLeft} open`}
          </Typography>
        </Box>
      </Box>

      {session.skillRequired && (
        <Chip label={`Skill: ${session.skillRequired}`} size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
      )}

      {session.conflict && session.myState === 'none' && !completed && (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', px: 1.25, py: 0.75, borderRadius: 2, bgcolor: alpha(tokens.accentStrong, 0.08) }}>
          <WarningAmberIcon sx={{ fontSize: 16, color: 'secondary.dark' }} />
          <Typography sx={{ fontSize: '0.78rem', color: 'secondary.dark' }}>
            Overlaps <strong>{session.conflict.name}</strong> at {session.conflict.startTime}
          </Typography>
        </Box>
      )}

      <Box onClick={(e) => e.stopPropagation()} sx={{ mt: 'auto' }}>
        {action}
      </Box>
    </Paper>
  );
}
