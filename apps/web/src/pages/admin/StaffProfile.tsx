import { Box, Paper, Typography } from '@mui/material';
import { useAuth } from '@/app/auth';
import { ChangePasswordCard, PageShell } from '@/components';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  field_coordinator: 'Field coordinator',
  volunteer: 'Volunteer',
};

/**
 * The staff profile (admin and field coordinator). Staff accounts carry no
 * volunteer profile — the page is the account itself: who you are signed in
 * as, and the one credential you own. Volunteers have their own richer
 * profile at /app/profile; all three roles share the ChangePasswordCard.
 */
export function StaffProfile() {
  const { user } = useAuth();

  return (
    <PageShell title="My Profile" maxWidth="md">
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.72)' }}>
        <Typography sx={{ fontWeight: 700, mb: 2 }}>Account</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Email
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>{user?.email}</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Role
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>
              {user ? (ROLE_LABELS[user.role] ?? user.role) : '—'}
            </Typography>
          </Box>
        </Box>
        {user?.role === 'admin' && (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 2 }}>
            Administrator passwords do not expire.
          </Typography>
        )}
      </Paper>

      <ChangePasswordCard />
    </PageShell>
  );
}
