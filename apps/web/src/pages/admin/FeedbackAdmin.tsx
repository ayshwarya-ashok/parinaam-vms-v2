import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import { usePrograms } from '@/api/admin';
import {
  AdminFeedbackRow,
  useAdminFeedback,
  useFeedbackAnalytics,
  useFeedbackPhotos,
} from '@/api/recognition';
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
  // Multi-select program filter (Round 43): empty selection means "All".
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [rating, setRating] = useState('all');
  // Round 52 — clicking a card opens its full detail, read-only, in a right drawer.
  const [detail, setDetail] = useState<AdminFeedbackRow | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: programs } = usePrograms('', 'all');
  // The analytics endpoint takes one program; the tiles follow the selection
  // when it is a single program and show the whole picture otherwise.
  const { data: analytics } = useFeedbackAnalytics(
    programIds.length === 1 ? programIds[0] : undefined,
  );
  const { data: allRows } = useAdminFeedback({ programId: '', rating });
  const rows = programIds.length
    ? (allRows ?? []).filter((r) => programIds.includes(r.program_id))
    : allRows;

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

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        {/* Program list comes from the live catalog; multiple programs can be
            ticked at once, and "All programs" clears the selection. */}
        <FormControl size="small" sx={{ minWidth: 260 }}>
          {/* displayEmpty renders "All programs" even with nothing selected, so
              the label must stay floated (shrink) and the outline notched — an
              un-shrunk label prints straight over the rendered value. */}
          <InputLabel shrink id="feedback-programs-label">Programs</InputLabel>
          <Select
            labelId="feedback-programs-label"
            multiple
            value={programIds}
            input={<OutlinedInput notched label="Programs" />}
            renderValue={(selected) =>
              selected.length === 0
                ? 'All programs'
                : (programs ?? [])
                    .filter((p) => selected.includes(p.id))
                    .map((p) => p.name)
                    .join(', ')
            }
            displayEmpty
            onChange={(e) => {
              const value = e.target.value as string[];
              setProgramIds(value.includes('__all') ? [] : value);
            }}
          >
            <MenuItem value="__all">
              <Checkbox size="small" checked={programIds.length === 0} />
              <ListItemText primary="All programs" />
            </MenuItem>
            {(programs ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                <Checkbox size="small" checked={programIds.includes(p.id)} />
                <ListItemText primary={p.name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FilterBar
          groups={[
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
      </Box>

      {rows?.length === 0 && <EmptyState message="No feedback matches your filters." />}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {(rows ?? []).map((row) => (
          <FeedbackCard
            key={row.id}
            row={row}
            busy={publish.isPending}
            onPublish={(value) => publish.mutate({ id: row.id, publish: value })}
            onOpen={() => setDetail(row)}
          />
        ))}
      </Box>

      <FeedbackDetailDrawer row={detail} onClose={() => setDetail(null)} />
    </PageShell>
  );
}

function FeedbackCard({
  row,
  busy,
  onPublish,
  onOpen,
}: {
  row: AdminFeedbackRow;
  busy: boolean;
  onPublish: (publish: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <Tooltip title="View the full feedback in a side panel" placement="top-start" enterDelay={600}>
    <Paper
      variant="outlined"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      sx={{
        p: 2.5,
        borderRadius: 3,
        cursor: 'pointer',
        transition: 'box-shadow 140ms ease, border-color 140ms ease',
        '&:hover': { boxShadow: '0 8px 22px rgba(27,110,160,0.14)', borderColor: tokens.accent },
        '&:focus-visible': { outline: `2px solid ${tokens.accent}`, outlineOffset: 2 },
      }}
    >
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
            {row.photo_count > 0 ? ` · 📷 ${row.photo_count}` : ''}
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
              sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(27,110,160,0.10)', color: tokens.accentStrong }} />
          ))}
          {row.improvements.map((label) => (
            <Chip key={`m-${label}`} label={`↑ ${label}`} size="small"
              sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(10,170,186,0.22)' }} />
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
            sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(30,127,79,0.12)', color: tokens.success, fontWeight: 700 }} />
        )}
        <Tooltip
          title={
            row.is_published_testimonial
              ? 'Take this quote off the public impact page'
              : 'Show this feedback as a quote on the public impact page'
          }
        >
          <span>
            <Button
              size="small"
              variant={row.is_published_testimonial ? 'pillOutlined' : 'pill'}
              sx={{ px: 1.5, py: 0.35 }}
              disabled={busy}
              onClick={(e) => {
                // The card itself opens the detail drawer — publishing must not.
                e.stopPropagation();
                onPublish(!row.is_published_testimonial);
              }}
            >
              {row.is_published_testimonial ? 'Retract testimonial' : '📣 Publish as testimonial'}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Paper>
    </Tooltip>
  );
}

/** Round 52 — the full submission, read-only, in a right-side drawer. */
function FeedbackDetailDrawer({ row, onClose }: { row: AdminFeedbackRow | null; onClose: () => void }) {
  const { data: photos, isLoading: photosLoading } = useFeedbackPhotos(
    row && row.photo_count > 0 ? row.id : null,
  );

  return (
    <Drawer
      anchor="right"
      open={row !== null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, maxWidth: '100%' } }}
    >
      {row && (
        <Box sx={{ p: 3, display: 'grid', gap: 2, alignContent: 'start' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box>
              <Typography variant="overline" sx={{ color: tokens.accentStrong }}>
                Feedback — read only
              </Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.3 }}>
                {row.volunteer_name}
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                {row.event_name} · {fmtDate(row.event_date)}
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                {row.program_name} · submitted {fmtDate(row.submitted_at)}
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close" size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
                Overall rating
              </Typography>
              <Typography sx={{ color: tokens.accentStrong, fontWeight: 700, fontSize: '1.2rem' }}>
                {'★'.repeat(row.overall_rating)}{'☆'.repeat(5 - row.overall_rating)}
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
                Would recommend
              </Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '1.2rem' }}>
                {row.nps_score}/10
              </Typography>
            </Paper>
          </Box>

          {row.vol_again && (
            <DetailBlock label="Would volunteer again">{row.vol_again}</DetailBlock>
          )}

          {(row.issues.length > 0 || row.improvements.length > 0) && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {row.issues.map((label) => (
                <Chip key={`i-${label}`} label={`⚠ ${label}`} size="small"
                  sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(27,110,160,0.10)', color: tokens.accentStrong }} />
              ))}
              {row.improvements.map((label) => (
                <Chip key={`m-${label}`} label={`↑ ${label}`} size="small"
                  sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(10,170,186,0.22)' }} />
              ))}
            </Box>
          )}

          {row.went_well && <DetailBlock label="What went well">{row.went_well}</DetailBlock>}
          {row.went_wrong_detail && <DetailBlock label="What went wrong">{row.went_wrong_detail}</DetailBlock>}
          {row.improvement_detail && <DetailBlock label="Suggested improvement">{row.improvement_detail}</DetailBlock>}
          {row.comments && <DetailBlock label="Comments">{row.comments}</DetailBlock>}

          {row.photo_count > 0 && (
            <Box>
              <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', mb: 0.75 }}>
                Photos ({row.photo_count}) — private until published
              </Typography>
              {photosLoading && <CircularProgress size={18} color="secondary" />}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {(photos ?? []).map((p) => (
                  <Tooltip key={p.id} title="Open the full-size photo in a new tab">
                    <Box
                      component="a"
                      href={p.fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      sx={{ display: 'block', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(31,43,54,0.15)' }}
                    >
                      <Box component="img" src={p.url} alt="Feedback photo"
                        sx={{ width: 130, height: 98, objectFit: 'cover', display: 'block' }} />
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          )}

          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {row.is_published_testimonial ? (
              <Chip label="Published testimonial" size="small"
                sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(30,127,79,0.12)', color: tokens.success, fontWeight: 700 }} />
            ) : (
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                Not published — publish from the card's button if this should appear on the public page.
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

function DetailBlock({ label, children }: { label: string; children: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>{children}</Typography>
    </Box>
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
