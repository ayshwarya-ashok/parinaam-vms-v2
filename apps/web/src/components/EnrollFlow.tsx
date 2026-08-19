import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { asApiError } from '@/api/client';
import {
  toEnrollBlock,
  useEnroll,
  useLeaveWaitlist,
  useWithdraw,
  type EnrollBlock,
  type SessionRow,
} from '@/api/volunteer';

/**
 * The enrollment interaction machine, shared by every screen with a session
 * card. The API's stable error codes drive which modal opens:
 * SCHEDULING_CONFLICT -> "Enroll anyway?", ACTIVITY_FULL -> "Join waitlist?",
 * PREREQUISITES_NOT_MET -> the named-trainings lock.
 */
export function useEnrollFlow() {
  const enroll = useEnroll();
  const withdraw = useWithdraw();
  const leaveWaitlist = useLeaveWaitlist();
  const { enqueueSnackbar } = useSnackbar();

  const [block, setBlock] = useState<(EnrollBlock & { session: SessionRow }) | null>(null);

  const attempt = (
    session: SessionRow,
    opts: { acknowledgeConflict?: boolean; acceptWaitlist?: boolean } = {},
  ) => {
    enroll.mutate(
      { eventId: session.id, ...opts },
      {
        onSuccess: (data) => {
          setBlock(null);
          enqueueSnackbar(
            data.state === 'enrolled'
              ? `Enrolled in ${session.name} ✓`
              : `Added to the waitlist for ${session.name} — position #${data.waitlistPosition}`,
            { variant: 'success' },
          );
        },
        onError: (err) => {
          const nextBlock = toEnrollBlock(err);
          if (nextBlock) {
            setBlock({ ...nextBlock, session });
          } else {
            setBlock(null);
            enqueueSnackbar(asApiError(err)?.message ?? 'Enrollment failed', { variant: 'error' });
          }
        },
      },
    );
  };

  const onWithdraw = (session: SessionRow) =>
    withdraw.mutate(session.id, {
      onSuccess: (data) =>
        enqueueSnackbar(
          data.promoted > 0
            ? 'Withdrawn — the next volunteer on the waitlist has your seat'
            : 'Withdrawn from the session',
          { variant: 'info' },
        ),
    });

  const onLeaveWaitlist = (session: SessionRow) =>
    leaveWaitlist.mutate(session.id, {
      onSuccess: () => enqueueSnackbar('Removed from the waitlist', { variant: 'info' }),
    });

  return {
    onEnroll: (session: SessionRow) => attempt(session),
    onWithdraw,
    onLeaveWaitlist,
    dialogs: <EnrollDialogs block={block} onClose={() => setBlock(null)} onRetry={attempt} />,
  };
}

function EnrollDialogs({
  block,
  onClose,
  onRetry,
}: {
  block: (EnrollBlock & { session: SessionRow }) | null;
  onClose: () => void;
  onRetry: (
    session: SessionRow,
    opts: { acknowledgeConflict?: boolean; acceptWaitlist?: boolean },
  ) => void;
}) {
  const navigate = useNavigate();
  if (!block) return null;

  if (block.kind === 'conflict') {
    return (
      <Dialog open onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 440 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          ⚠ Scheduling conflict
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary' }}>
            <strong>{block.session.name}</strong> overlaps with your enrolled session{' '}
            <strong>{block.conflict?.name}</strong> (starts {block.conflict?.startTime}). You can
            still enroll — the overlap will be recorded.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="pill" onClick={() => onRetry(block.session, { acknowledgeConflict: true })}>
            Enroll anyway
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (block.kind === 'full') {
    return (
      <Dialog open onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 440 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          ⏳ Join the waitlist?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>
            All {block.maxSlots} seats for <strong>{block.session.name}</strong> are filled.
          </Typography>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Your position would be <strong>#{block.waitlistPosition}</strong>. If a seat opens you
            are enrolled automatically and notified by email.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="pill" onClick={() => onRetry(block.session, { acceptWaitlist: true })}>
            Join waitlist
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} PaperProps={{ sx: { borderRadius: 4, maxWidth: 460 } }}>
      <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
        🔒 Trainings required first
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary', mb: 1 }}>
          Before enrolling in <strong>{block.session.name}</strong>, complete:
        </Typography>
        <List dense>
          {(block.missingTrainings ?? []).map((t) => (
            <ListItem key={t.code} disablePadding>
              <ListItemText
                primary={t.name}
                secondary={t.isMandatory ? 'Mandatory compliance training' : 'Activity training'}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="pillOutlined" onClick={onClose}>
          Later
        </Button>
        <Button variant="pill" onClick={() => navigate('/app/trainings')}>
          Go to my trainings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
