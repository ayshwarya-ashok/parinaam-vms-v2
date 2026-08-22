import { Box, Container, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { LinkEventInfo, LinkFailure } from '@/api/link';

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Mobile-first shell shared by both signed-link forms. */
export function LinkFormShell({
  strap,
  title,
  event,
  children,
}: {
  strap: string;
  title: string;
  event?: LinkEventInfo;
  children: ReactNode;
}) {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 } }}>
      <Paper elevation={8} sx={{ borderRadius: 4, overflow: 'hidden' }}>
        <Box sx={{ bgcolor: 'primary.main', px: 3, py: 2 }}>
          <Box component="img" src="/parinaam-logo-dark.svg" alt="Parinaam Foundation" sx={{ height: 34, display: 'block', mb: 0.75 }} />
          <Typography variant="overline" sx={{ color: 'secondary.main' }}>
            {strap}
          </Typography>
          <Typography sx={{ color: '#fff', fontFamily: '"Source Serif 4", Georgia, serif', fontSize: '1.4rem' }}>
            {title}
          </Typography>
        </Box>

        {event && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: '2fr 1fr 1fr' },
              gap: 1.5,
              px: 3,
              py: 2,
              bgcolor: 'rgba(141,184,166,0.12)',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Info label="Session" value={event.name} />
            <Info label="Date" value={fmtDate(event.date)} />
            <Info label="Time" value={`${event.startTime} (${event.durationHours}h)`} />
            {event.location && <Info label="Location" value={event.location} />}
          </Box>
        )}

        <Box sx={{ px: 3, py: 3 }}>{children}</Box>
      </Paper>
      <Typography sx={{ textAlign: 'center', mt: 2, fontSize: '0.78rem', color: 'text.secondary' }}>
        This personal link needs no login. Questions? admin@parinaam.org
      </Typography>
    </Container>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

const FAILURE_COPY: Record<LinkFailure, { title: string; body: string }> = {
  TOKEN_EXPIRED: {
    title: 'This link has expired',
    body: 'Attendance links stay active for 7 days. Please ask the Parinaam team to send you a fresh one.',
  },
  TOKEN_CONSUMED: {
    title: 'Already submitted',
    body: 'A submission was already recorded through this link. If something needs correcting, contact the Parinaam team.',
  },
  TOKEN_INVALID: {
    title: 'This link is not valid',
    body: 'The link may have been copied incompletely from the email. Try opening it again directly, or ask for a fresh one.',
  },
  UNKNOWN: {
    title: 'Something went wrong',
    body: 'We could not load this form. Please try again in a moment.',
  },
};

export function LinkFailurePage({ strap, failure }: { strap: string; failure: LinkFailure }) {
  const copy = FAILURE_COPY[failure];
  return (
    <LinkFormShell strap={strap} title={copy.title}>
      <Typography sx={{ color: 'text.secondary' }}>{copy.body}</Typography>
      <Typography sx={{ color: 'text.secondary', mt: 2, fontSize: '0.85rem' }}>
        ✉ admin@parinaam.org
      </Typography>
    </LinkFormShell>
  );
}

export function LinkThankYou({
  strap,
  title,
  message,
}: {
  strap: string;
  title: string;
  message: string;
}) {
  return (
    <LinkFormShell strap={strap} title={title}>
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            mx: 'auto',
            mb: 2,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontSize: '1.5rem',
            background: 'linear-gradient(135deg, #2d9e6e, #1d6b4d)',
          }}
        >
          ✓
        </Box>
        <Typography variant="h3" sx={{ fontSize: '1.5rem', mb: 1 }}>
          Thank you!
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>{message}</Typography>
      </Box>
    </LinkFormShell>
  );
}
