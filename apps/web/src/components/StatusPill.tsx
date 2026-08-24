import { Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { tokens } from '@/theme';

type Status =
  | 'draft'
  | 'active'
  | 'upcoming'
  | 'inprogress'
  | 'completed'
  | 'cancelled'
  | 'discontinued'
  | 'enrolled'
  | 'pending'
  | 'inactive'
  | 'sent'
  | 'failed';

const palette: Record<Status, { bg: string; fg: string }> = {
  upcoming: { bg: alpha(tokens.success, 0.1), fg: tokens.success },
  active: { bg: alpha(tokens.success, 0.1), fg: tokens.success },
  enrolled: { bg: alpha(tokens.success, 0.1), fg: tokens.success },
  sent: { bg: alpha(tokens.success, 0.1), fg: tokens.success },
  inprogress: { bg: alpha(tokens.accent, 0.14), fg: tokens.accentStrong },
  completed: { bg: alpha(tokens.info, 0.1), fg: tokens.info },
  draft: { bg: alpha(tokens.mint, 0.2), fg: '#3a7a68' },
  inactive: { bg: alpha(tokens.accentStrong, 0.1), fg: tokens.accentStrong },
  pending: { bg: alpha(tokens.accent, 0.12), fg: tokens.accentStrong },
  cancelled: { bg: alpha(tokens.accentStrong, 0.1), fg: tokens.accentStrong },
  discontinued: { bg: alpha(tokens.accentStrong, 0.1), fg: tokens.accentStrong },
  failed: { bg: alpha(tokens.accentStrong, 0.1), fg: tokens.accentStrong },
};

export function StatusPill({ status }: { status: Status }) {
  const colors = palette[status] ?? palette.pending;
  return (
    <Chip
      label={status === 'inprogress' ? 'in progress' : status}
      size="small"
      sx={{
        bgcolor: colors.bg,
        color: colors.fg,
        fontWeight: 700,
        fontSize: '0.72rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    />
  );
}
