import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import { useAuth } from '@/app/auth';
import { useToast } from '@/app/toast';
import { PasswordField } from './PasswordField';

/** Days until an ISO instant, floored at whole days; negative when past. */
function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The one change-password card, shared by every role's profile page.
 * Volunteers and field coordinators also see their 120-day expiry here —
 * an info line normally, a red alert when five days or fewer remain, and a
 * you-must-change-now alert after an admin reset or an expiry.
 */
export function ChangePasswordCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  const changePassword = useMutation({
    mutationFn: async () =>
      (await api.post('/auth/change-password', {
        currentPassword: pw.current,
        newPassword: pw.next,
      })).data,
    onSuccess: () => {
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed — other devices must sign in again');
      // The session flags (mustChangePassword, expiry) just moved — reload them.
      void refresh();
    },
    onError: (err) => toast.failure(asApiError(err)?.message ?? 'Could not change the password.'),
  });

  const expiresAt = user?.passwordExpiresAt ?? null;
  const daysLeft = expiresAt ? daysUntil(expiresAt) : null;

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mt: 2, bgcolor: 'rgba(255,255,255,0.8)' }}>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Change password</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 2 }}>
        If your account was created for you, your initial password is the shared default — set
        your own here.
      </Typography>

      {user?.mustChangePassword && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          You must set a new password now — an administrator reset it, or it has expired.
        </Alert>
      )}
      {!user?.mustChangePassword && expiresAt && daysLeft !== null && (
        daysLeft <= 5 ? (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
            Your password expires in {daysLeft} day{daysLeft === 1 ? '' : 's'} — on{' '}
            {fmtDay(expiresAt)}. Change it now.
          </Alert>
        ) : (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 2 }}>
            ⏳ Your password expires on <strong>{fmtDay(expiresAt)}</strong> ({daysLeft} days from
            now). Passwords are valid for 120 days.
          </Typography>
        )
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <PasswordField label="Current password" value={pw.current}
          autoComplete="current-password"
          onChange={(e) => setPw((v) => ({ ...v, current: e.target.value }))} />
        <PasswordField label="New password" value={pw.next}
          helperText="At least 8 characters"
          autoComplete="new-password"
          onChange={(e) => setPw((v) => ({ ...v, next: e.target.value }))} />
        <PasswordField label="Confirm new password" value={pw.confirm}
          error={pw.confirm !== '' && pw.confirm !== pw.next}
          helperText={pw.confirm !== '' && pw.confirm !== pw.next ? 'Does not match' : ' '}
          autoComplete="new-password"
          onChange={(e) => setPw((v) => ({ ...v, confirm: e.target.value }))} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
        <Button
          variant="pillOutlined"
          disabled={
            changePassword.isPending || !pw.current || pw.next.length < 8 || pw.next !== pw.confirm
          }
          onClick={() => changePassword.mutate()}
        >
          {changePassword.isPending ? 'Changing…' : 'Change password'}
        </Button>
      </Box>
    </Paper>
  );
}
