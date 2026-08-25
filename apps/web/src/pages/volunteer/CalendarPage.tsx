import { Box, Button, Chip, Paper, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCalendar, type SessionRow } from '@/api/volunteer';
import { PageShell } from '@/components';
import { tokens } from '@/theme';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const PILL_COLORS = [tokens.accent, tokens.info, tokens.success, '#5c6bc0', '#078894', tokens.accentStrong];

/**
 * A Date as the LOCAL yyyy-mm-dd. toISOString() renders UTC, which for anyone
 * east of Greenwich is yesterday until the offset elapses — in IST the "today"
 * highlight sat on the wrong square until 05:30 every morning.
 */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Stable colour per programme, so a series reads as one band across the month. */
function programColor(programId: string): string {
  let hash = 0;
  for (const ch of programId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PILL_COLORS[hash % PILL_COLORS.length];
}

/** The prototype's bespoke month grid — pills per session, conflict dots. */
export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const navigate = useNavigate();

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const { data } = useCalendar(monthKey);
  const [selected, setSelected] = useState<string | null>(null);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const list: Array<{ iso: string; day: number; current: boolean }> = [];
    for (let i = first - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      list.push({ iso: localIso(d), day: d.getDate(), current: false });
    }
    for (let d = 1; d <= days; d++) {
      list.push({ iso: `${monthKey}-${String(d).padStart(2, '0')}`, day: d, current: true });
    }
    while (list.length % 7 !== 0) {
      const d = new Date(year, month + 1, list.length - first - days + 1);
      list.push({ iso: localIso(d), day: d.getDate(), current: false });
    }
    return list;
  }, [year, month, monthKey]);

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
  };

  const todayIso = localIso(today);

  /** Jump straight to a date: move the grid to its month and open that day. */
  const jumpTo = (iso: string) => {
    if (!/^d{4}-d{2}-d{2}$/.test(iso)) return;
    const [y, mo] = iso.split('-').map(Number);
    setYear(y);
    setMonth(mo - 1);
    setSelected(iso);
  };
  const byDate = data?.byDate ?? {};
  const conflictDays = new Set(data?.conflictDays ?? []);
  const selectedSessions: SessionRow[] = selected ? (byDate[selected] ?? []) : [];

  return (
    <PageShell
      title={`${MONTHS[month]} ${year}`}
      actions={
        <>
          <TextField
            type="date"
            size="small"
            label="Jump to date"
            InputLabelProps={{ shrink: true }}
            value={selected ?? ''}
            onChange={(e) => jumpTo(e.target.value)}
            sx={{ minWidth: 170, '& .MuiInputBase-root': { borderRadius: 999 } }}
          />
          <Button variant="pillOutlined" size="small" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(todayIso); }}>
            Today
          </Button>
          <Button variant="pillOutlined" size="small" onClick={() => step(-1)}>‹</Button>
          <Button variant="pillOutlined" size="small" onClick={() => step(1)}>›</Button>
        </>
      }
    >
      <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mb: 1.5 }}>
        🗓 Click any day to see its sessions. A{' '}
        <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.accentStrong }} />{' '}
        dot marks a day where two of your enrollments overlap.
      </Typography>

      <Paper variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.7)' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid', borderColor: 'divider' }}>
          {DOW.map((d) => (
            <Typography key={d} sx={{ p: 1, textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
              {d}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((cell) => {
            const sessions = byDate[cell.iso] ?? [];
            const hasConflict = conflictDays.has(cell.iso);
            return (
              <Box
                key={cell.iso}
                onClick={() => cell.current && setSelected(cell.iso)}
                sx={{
                  minHeight: 92,
                  p: 0.75,
                  borderRight: '1px solid',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  cursor: cell.current ? 'pointer' : 'default',
                  opacity: cell.current ? 1 : 0.35,
                  bgcolor:
                    cell.iso === selected
                      ? alpha(tokens.accent, 0.08)
                      : cell.iso === todayIso
                        ? alpha(tokens.mint, 0.15)
                        : undefined,
                  '&:hover': cell.current ? { bgcolor: alpha(tokens.accent, 0.05) } : undefined,
                }}
              >
                <Typography sx={{ fontSize: '0.78rem', fontWeight: cell.iso === todayIso ? 800 : 600 }}>
                  {cell.day}
                  {hasConflict && (
                    <Box component="span" sx={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', bgcolor: tokens.accentStrong, ml: 0.5 }} />
                  )}
                </Typography>
                {sessions.slice(0, 3).map((s) => (
                  <Typography
                    key={s.id}
                    noWrap
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#fff',
                      bgcolor: s.status === 'cancelled' ? 'rgba(31,43,54,0.25)' : programColor(s.program.id),
                      borderRadius: 999,
                      px: 0.75,
                      py: 0.1,
                      mt: 0.4,
                      textDecoration: s.status === 'cancelled' ? 'line-through' : 'none',
                    }}
                  >
                    {s.name}
                  </Typography>
                ))}
                {sessions.length > 3 && (
                  <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.25 }}>
                    +{sessions.length - 3} more
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Paper>

      {selected && (
      <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.75)' }}>
        {selected && (
          <>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>
              {new Date(`${selected}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              <Typography component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: '0.85rem' }}>
                {selectedSessions.length} session{selectedSessions.length === 1 ? '' : 's'}
              </Typography>
            </Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {selectedSessions.map((s) => (
                <Paper
                  key={s.id}
                  variant="outlined"
                  onClick={() => navigate(`/app/events/${s.id}`)}
                  sx={{ p: 1.5, borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.8)', opacity: s.status === 'cancelled' ? 0.55 : 1 }}
                >
                  <Box>
                    <Chip label={s.program.name} size="small" sx={{ bgcolor: programColor(s.program.id), color: '#fff', fontWeight: 700, fontSize: '0.68rem', height: 20, mb: 0.5 }} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>{s.name}</Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                      {s.startTime} · {s.durationHours}h · {s.location ?? 'TBC'}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: s.myState === 'enrolled' ? '#1E7F4F' : s.capacity.spotsLeft === 0 ? tokens.accentStrong : '#1E7F4F' }}>
                    {s.myState === 'enrolled'
                      ? '✓ Enrolled'
                      : s.myState === 'waitlisted'
                        ? `⏳ #${s.waitlistPosition}`
                        : s.status === 'cancelled'
                          ? 'Cancelled'
                          : s.capacity.spotsLeft === 0
                            ? 'Full'
                            : `${s.capacity.spotsLeft} open`}
                  </Typography>
                </Paper>
              ))}
              {selectedSessions.length === 0 && (
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                  No sessions scheduled.
                </Typography>
              )}
            </Box>
          </>
        )}
      </Paper>
      )}
    </PageShell>
  );
}
