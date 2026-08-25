import LockIcon from '@mui/icons-material/Lock';
import { Box, Chip, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useMyTrainings, type MyTraining } from '@/api/trainings';
import { PageShell } from '@/components';
import { tokens } from '@/theme';

function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusOf(t: MyTraining): { label: string; color: string } {
  if (t.currentlyPassed && t.expiryDate) {
    return { label: `Valid until ${fmtDate(t.expiryDate)}`, color: tokens.success };
  }
  if (t.currentlyPassed) return { label: 'Completed ✓', color: tokens.success };
  if (t.exhausted) return { label: 'Attempts exhausted — contact admin', color: tokens.accentStrong };
  if (t.attemptsUsed > 0) {
    return {
      label: `Attempt ${t.attemptsUsed}${t.maxAttempts ? `/${t.maxAttempts}` : ''} — not passed`,
      color: tokens.accentStrong,
    };
  }
  return { label: 'Pending', color: tokens.accentStrong };
}

function TrainingRow({ t, locked }: { t: MyTraining; locked?: boolean }) {
  const navigate = useNavigate();
  const status = statusOf(t);
  return (
    <Paper
      variant="outlined"
      onClick={() => !locked && navigate(`/app/trainings/${t.id}`)}
      sx={{
        p: 1.75,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.55 : 1,
        bgcolor: 'rgba(255,255,255,0.8)',
        '&:hover': locked ? undefined : { boxShadow: '0 8px 20px rgba(31,43,54,0.08)' },
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: t.currentlyPassed ? tokens.success : t.exhausted ? tokens.accentStrong : alpha(tokens.accent, 0.6),
        }}
      />
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700 }}>{t.name}</Typography>
          <Chip
            label={t.category}
            size="small"
            sx={{
              fontSize: '0.68rem',
              height: 20,
              bgcolor: t.category === 'compliance' ? alpha(tokens.accentStrong, 0.1) : alpha(tokens.info, 0.1),
              color: t.category === 'compliance' ? tokens.accentStrong : tokens.info,
              fontWeight: 700,
            }}
          />
          {t.isMandatory && (
            <Chip label="mandatory" size="small" sx={{ fontSize: '0.68rem', height: 20, bgcolor: tokens.accentStrong, color: '#fff', fontWeight: 700 }} />
          )}
        </Box>
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mt: 0.25 }}>
          {t.duration} · {t.mode} · {t.questionCount} questions · pass at {t.passingScore}%
          {t.latestScore !== null ? ` · latest score ${t.latestScore}%` : ''}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: status.color }}>
        {status.label}
      </Typography>
      {!locked && <Typography sx={{ color: 'text.secondary' }}>›</Typography>}
    </Paper>
  );
}

export function MyTrainings() {
  const { data } = useMyTrainings();

  return (
    <PageShell
      title="My Required Trainings"
      description="Complete the three mandatory compliance trainings first — they unlock activity trainings, and both unlock session enrollment."
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>Mandatory compliance</Typography>
        <Chip label="Required before sessions" size="small" sx={{ bgcolor: tokens.accentStrong, color: '#fff', fontWeight: 700, fontSize: '0.7rem' }} />
      </Box>
      <Box sx={{ display: 'grid', gap: 1, mb: 4 }}>
        {(data?.mandatory ?? []).map((t) => (
          <TrainingRow key={t.id} t={t} />
        ))}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>Activity trainings</Typography>
        {data?.activityUnlocked ? (
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: tokens.success }}>✓ Unlocked</Typography>
        ) : (
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: tokens.accentStrong, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LockIcon sx={{ fontSize: 14 }} /> Locked
          </Typography>
        )}
      </Box>

      {!data?.activityUnlocked && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 1, display: 'flex', gap: 1.5, alignItems: 'center', bgcolor: alpha(tokens.accentStrong, 0.06) }}>
          <LockIcon sx={{ color: tokens.accentStrong }} />
          <Typography sx={{ fontSize: '0.9rem' }}>
            <strong>Locked</strong> — pass all mandatory compliance trainings above to unlock these.
          </Typography>
        </Paper>
      )}
      <Box sx={{ display: 'grid', gap: 1 }}>
        {(data?.activity ?? []).map((t) => (
          <TrainingRow key={t.id} t={t} locked={!data?.activityUnlocked} />
        ))}
      </Box>
    </PageShell>
  );
}
