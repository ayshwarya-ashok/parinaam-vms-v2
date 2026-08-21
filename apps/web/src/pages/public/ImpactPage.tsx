import { Box, Button, Container, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { API_BASE_URL } from '@/api/client';
import { tokens } from '@/theme';

interface ImpactPayload {
  stats: {
    volunteers: number;
    hours: string;
    beneficiaries: number;
    sessions: number;
    active_programs: number;
    cities: number;
    avg_rating: string;
  };
  programs: Array<{ name: string; volunteers: number; hours: string; beneficiaries: number }>;
  testimonials: Array<{ comments: string; overall_rating: number; attribution: string; program_name: string }>;
  gallery: Array<{ url: string; caption: string | null }>;
}

/**
 * The shareable public page. No auth context at all — it uses a bare axios
 * call so no interceptor ever attaches a token or triggers a refresh here.
 */
export function ImpactPage() {
  const { data } = useQuery({
    queryKey: ['public-impact'],
    queryFn: async () => (await axios.get<ImpactPayload>(`${API_BASE_URL}/public/impact`)).data,
    staleTime: 5 * 60_000,
  });

  const heroStats = data
    ? [
        { value: data.stats.volunteers.toLocaleString('en-IN'), label: 'Volunteers' },
        { value: Number(data.stats.hours).toLocaleString('en-IN'), label: 'Hours contributed' },
        { value: data.stats.beneficiaries.toLocaleString('en-IN'), label: 'Lives touched' },
        { value: String(data.stats.sessions), label: 'Sessions run' },
        { value: String(data.stats.active_programs), label: 'Active programmes' },
        { value: String(data.stats.cities), label: 'Cities' },
      ]
    : [];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fbf6ec' }}>
      {/* Hero */}
      <Box sx={{ bgcolor: tokens.ink, color: '#fdf9f0', py: { xs: 6, md: 9 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="overline" sx={{ color: tokens.mint, letterSpacing: '0.14em' }}>
              PARINAAM FOUNDATION
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                component={RouterLink}
                to="/login"
                sx={{ color: '#fdf9f0', borderRadius: 999, px: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}
              >
                Volunteer login
              </Button>
              <Button
                component={RouterLink}
                to="/admin/login"
                sx={{ color: 'rgba(253,249,240,0.7)', borderRadius: 999, px: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}
              >
                Admin
              </Button>
            </Box>
          </Box>
          <Typography
            variant="h1"
            sx={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', maxWidth: '16em', lineHeight: 1.15, my: 2 }}
          >
            Change, measured — the impact our volunteers create.
          </Typography>
          <Typography sx={{ maxWidth: '38em', opacity: 0.85, mb: 4 }}>
            Every figure on this page is drawn live from our volunteer management system —
            hours actually attended, beneficiaries actually reached, in the words of the
            people who were there.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
              gap: 2,
            }}
          >
            {heroStats.map((s) => (
              <Box key={s.label}>
                <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: tokens.accent }}>
                  {s.value}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75 }}>
                  {s.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
        {/* Programmes */}
        {data && data.programs.length > 0 && (
          <>
            <Typography variant="h3" sx={{ mb: 3 }}>Where the hours went</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 6 }}>
              {data.programs.map((p) => (
                <Paper key={p.name} variant="outlined" sx={{ p: 3, borderRadius: 3, borderTop: `4px solid ${tokens.mint}` }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
                    {p.volunteers} volunteer turnouts · {Number(p.hours)} hours
                  </Typography>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: tokens.accentStrong, mt: 1 }}>
                    {p.beneficiaries.toLocaleString('en-IN')}
                    <Typography component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary', ml: 0.75 }}>
                      beneficiaries reached
                    </Typography>
                  </Typography>
                </Paper>
              ))}
            </Box>
          </>
        )}

        {/* Gallery */}
        {data && data.gallery.length > 0 && (
          <>
            <Typography variant="h3" sx={{ mb: 3 }}>From the field</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 6 }}>
              {data.gallery.map((photo, i) => (
                <Paper key={i} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                  <img
                    src={photo.url}
                    alt={photo.caption ?? 'Volunteers in the field'}
                    style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                  {photo.caption && (
                    <Typography sx={{ p: 1, fontSize: '0.78rem', color: 'text.secondary' }}>
                      {photo.caption}
                    </Typography>
                  )}
                </Paper>
              ))}
            </Box>
          </>
        )}

        {/* Testimonials — published only (BR-16) */}
        {data && data.testimonials.length > 0 && (
          <>
            <Typography variant="h3" sx={{ mb: 3 }}>In their words</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 6 }}>
              {data.testimonials.map((t, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                  <Typography sx={{ color: tokens.accentStrong, fontWeight: 700, mb: 1 }}>
                    {'★'.repeat(t.overall_rating)}{'☆'.repeat(5 - t.overall_rating)}
                  </Typography>
                  <Typography sx={{ fontStyle: 'italic', mb: 1.5 }}>“{t.comments}”</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                    — {t.attribution}, {t.program_name}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </>
        )}

        {/* CTA */}
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, textAlign: 'center', bgcolor: 'rgba(141,184,166,0.12)' }}
        >
          <Typography variant="h3" sx={{ mb: 1 }}>Be part of the next number</Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3, maxWidth: '34em', mx: 'auto' }}>
            {data && Number(data.stats.avg_rating) > 0
              ? `Volunteers rate their sessions ${data.stats.avg_rating} out of 5 — come see why.`
              : 'Join a session near you — training, scheduling and certificates all included.'}
          </Typography>
          <Button variant="pill" size="large" component={RouterLink} to="/login">
            Volunteer with us
          </Button>
        </Paper>
      </Container>

      <Box component="footer" sx={{ py: 4, textAlign: 'center', color: 'text.secondary', fontSize: '0.8rem' }}>
        © {new Date().getFullYear()} Parinaam Foundation · Figures update automatically from verified attendance records.
      </Box>
    </Box>
  );
}
