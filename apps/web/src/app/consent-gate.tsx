import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '@/api/client';

interface Compliance {
  consentComplete: boolean;
  isCompliant: boolean;
  mandatoryPassed: number;
  mandatoryTotal: number;
}

/**
 * BR-02: training content is unreachable until the compliance agreement is
 * signed. Wraps the /app/trainings routes.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['compliance'],
    queryFn: async () => (await api.get<Compliance>('/volunteers/me/compliance')).data,
  });

  if (isLoading) {
    return (
      <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}>
        <CircularProgress color="secondary" />
      </Box>
    );
  }

  if (data && !data.consentComplete) {
    return <Navigate to="/app/consent" replace />;
  }

  return <>{children}</>;
}
