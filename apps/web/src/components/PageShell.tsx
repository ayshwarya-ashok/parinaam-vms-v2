import { Box, Container, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl';
}

/**
 * The prototype's inner-shell layout: serif title, actions on the right.
 *
 * There is no eyebrow. It used to print "Admin › People" above the title,
 * which is exactly what the breadcrumb strip says one line higher — and unlike
 * the strip, it was not clickable.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  maxWidth = 'xl',
}: PageShellProps) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: { xs: 3, md: 5 } }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h2" sx={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>
            {title}
          </Typography>
          {description && (
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: '44rem' }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
      {children}
    </Container>
  );
}
