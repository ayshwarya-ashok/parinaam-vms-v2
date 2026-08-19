import ConstructionIcon from '@mui/icons-material/Construction';
import { Paper, Typography } from '@mui/material';
import { PageShell } from '@/components';

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  phase: string;
}

/**
 * Every route in the table exists from Phase 0 so navigation, layouts and
 * breadcrumbs are real. Each placeholder names the phase that replaces it.
 */
export function Placeholder({ eyebrow, title, phase }: PlaceholderProps) {
  return (
    <PageShell eyebrow={eyebrow} title={title}>
      <Paper
        variant="outlined"
        sx={{
          p: 6,
          borderRadius: 4,
          textAlign: 'center',
          bgcolor: 'rgba(255,255,255,0.6)',
          color: 'text.secondary',
        }}
      >
        <ConstructionIcon sx={{ fontSize: 40, mb: 1, color: 'secondary.main' }} />
        <Typography sx={{ fontWeight: 600 }}>Built in {phase}</Typography>
        <Typography sx={{ fontSize: '0.9rem', mt: 0.5 }}>
          The route, layout and breadcrumb are live; the feature lands with its phase.
        </Typography>
      </Paper>
    </PageShell>
  );
}
