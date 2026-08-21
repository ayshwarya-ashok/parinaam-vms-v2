import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import { usePrograms } from '@/api/admin';
import { AdminFeedbackRow, useAdminFeedback, useFeedbackAnalytics } from '@/api/recognition';
import { EmptyState, FilterBar, PageShell, StatTile } from '@/components';
import { tokens } from '@/theme';

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Per-occurrence feedback review: aggregates on top, submissions below, publish per card (BR-16). */
export function FeedbackAdmin() {
  const [programId, setProgramId] = useState('');
  const [rating, setRating] = useState('all');
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: programs } = usePrograms('', 'all');
  const { data: analytics } = useFeedbackAnalytics(programId || undefined);
  const { data: rows } = useAdminFeedback({ programId, rating });

  const publish = useMutation({
    mutationFn: async (input: { id: string; publish: boolean }) =>
      (await api.patch(`/feedback/${input.id}/publish`, { publish: input.publish })).data,
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      enqueueSnackbar(input.publish ? 'Published as testimonial' : 'Testimonial retracted', {
        variant: 'success',
      });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Update failed', { variant: 'error' }),
  });

  return (
    <PageShell
      title="Volunteer Feedback"
      description="Every rating points at one specific session. Publishing a testimonial is an explicit act — nothing surfaces publicly without it."
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatTile label="Submissions" value={analytics?.total ?? '—'} />
        <StatTile label="Avg rating" value={analytics?.avgRating != null ? `${analytics.avgRating} ★` : '—'} />
        <StatTile label="NPS" value={analytics?.nps ?? '—'} sub={analytics?.avgNps != null ? `avg score ${analytics.avgNps}` : undefined} />
        <StatTile label="Published testimonials" value={analytics?.published ?? '—'} />
      </Box>

      <FilterBar
        groups={[
          {
            label: 'Programme',
            value: programId || 'all',
            onChange: (v) => setProgramId(v === 'all' ? '' : v),
            options: [
              { value: 'all', label: 'All programmes' },
              ...(programs ?? []).map((p) => ({ value: p.id, label: p.name })),
            ],
          },
          {
            label: 'Rating',
            value: rating,
            onChange: setRating,
            options: [
              { value: 'all', label: 'All' },
              { value: '5', label: '5★' },
              { value: '4', label: '4★' },
              { value: '3', label: '3★' },
              { value: '2', label: '≤2★' },
            ],
          },
        ]}
      />

      {rows?.length === 0 && <EmptyState message="No feedback matches your filters." />}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {(rows ?? []).map((row) => (
          <FeedbackCard
            key={row.id}
            row={row}
            busy={publish.isPending}
            onPublish={(value) => publish.mutate({ id: row.id, publish: value })}
          />
        ))}
      </Box>
    </PageShell>
  );
}

function FeedbackCard({
  row,
  busy,
  onPublish,
}: {
  row: AdminFeedbackRow;
  busy: boolean;
  onPublish: (publish: boolean) => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {row.volunteer_name}
            <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.82rem' }}>
              {' '}· {row.event_name} · {fmtDate(row.event_date)}
            </Typography>
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            {row.program_name} · submitted {fmtDate(row.submitted_at)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ color: tokens.accentStrong, fontWeight: 700, fontSize: '1.05rem' }}>
            {'★'.repeat(row.overall_rating)}{'☆'.repeat(5 - row.overall_rating)}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            NPS {row.nps_score}/10{row.vol_again ? ` · again: ${row.vol_again}` : ''}
          </Typography>
        </Box>
      </Box>

      {(row.issues.length > 0 || row.improvements.length > 0) && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
          {row.issues.map((label) => (
            <Chip key={`i-${label}`} label={`⚠ ${label}`} size="small"
              sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(188,83,40,0.10)', color: tokens.accentStrong }} />
          ))}
          {row.improvements.map((label) => (
            <Chip key={`m-${label}`} label={`↑ ${label}`} size="small"
              sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(141,184,166,0.22)' }} />
          ))}
        </Box>
      )}

      {row.went_well && <Quote label="Went well" text={row.went_well} />}
      {row.went_wrong_detail && <Quote label="Went wrong" text={row.went_wrong_detail} />}
      {row.improvement_detail && <Quote label="Improve" text={row.improvement_detail} />}
      {row.comments && <Quote label="Comments" text={row.comments} />}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mt: 1.5 }}>
        {row.is_published_testimonial && (
          <Chip label="Published testimonial" size="small"
            sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(29,107,77,0.12)', color: tokens.success, fontWeight: 700 }} />
        )}
        <Button
          size="small"
          variant={row.is_published_testimonial ? 'pillOutlined' : 'pill'}
          sx={{ px: 1.5, py: 0.35 }}
          disabled={busy}
          onClick={() => onPublish(!row.is_published_testimonial)}
        >
          {row.is_published_testimonial ? 'Retract testimonial' : '📣 Publish as testimonial'}
        </Button>
      </Box>
    </Paper>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <Typography sx={{ fontSize: '0.86rem', mt: 1 }}>
      <Box component="span" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}:
      </Box>{' '}
      {text}
    </Typography>
  );
}
