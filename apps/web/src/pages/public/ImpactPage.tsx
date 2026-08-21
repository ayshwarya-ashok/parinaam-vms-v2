import { Box, Button, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import { API_BASE_URL } from '@/api/client';
import { useAuth } from '@/app/auth';
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
    attendance_pct: string;
    training_completions: number;
    certificates_issued: number;
    partner_organizations: number;
    feedback_responses: number;
    avg_nps: string;
  };
  programs: Array<{ name: string; volunteers: number; hours: string; beneficiaries: number }>;
  testimonials: Array<{
    comments: string;
    overall_rating: number;
    attribution: string;
    program_name: string;
  }>;
  gallery: Array<{ url: string; caption: string | null }>;
}

/** The prototype's card gradients, in order. */
const GRADIENTS = [
  'linear-gradient(135deg,#d96c3f 0%,#bc5328 100%)',
  'linear-gradient(135deg,#3a7a68 0%,#1d6b4d 100%)',
  'linear-gradient(135deg,#3a60a0 0%,#2b4a80 100%)',
  'linear-gradient(135deg,#8db8a6 0%,#5a9a84 100%)',
  'linear-gradient(135deg,#5c6bc0 0%,#3949ab 100%)',
  'linear-gradient(135deg,#0f2b2d 0%,#1a4a4d 100%)',
];

const SECTION_PAD = { py: { xs: 5, md: 8 }, px: { xs: 3, sm: 6, md: 12, lg: 16 } };
const SERIF = '"Source Serif 4", Georgia, serif';

function initials(attribution: string): string {
  return attribution
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The public impact page, following the prototype's screen-impact-page
 * section for section — hero, impact numbers, field gallery, volunteer
 * voices, feedback call to action, footer — with the join/admin bar lifted to
 * the top, where a visitor who came to sign in does not have to scroll the
 * whole report to find the door.
 *
 * Every figure is live. Where the prototype hard-coded a number, this reads
 * the equivalent from /public/impact; the gallery falls back to the
 * prototype's gradient cards, captioned with real programmes, whenever fewer
 * public photos exist than tiles.
 */
export function ImpactPage() {
  const { status, user } = useAuth();

  const { data } = useQuery({
    queryKey: ['public-impact'],
    queryFn: async () => (await axios.get<ImpactPayload>(`${API_BASE_URL}/public/impact`)).data,
    staleTime: 5 * 60_000,
  });

  // A signed-in visitor asked for the app, not the brochure.
  if (status === 'authenticated' && user) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/app/dashboard'} replace />;
  }

  const s = data?.stats;
  const num = (value: number | string | undefined, fallback = '—') =>
    value === undefined ? fallback : Number(value).toLocaleString('en-IN');

  const heroStats = [
    { value: s ? num(s.volunteers) : '—', label: 'Active volunteers' },
    { value: s ? num(s.hours) : '—', label: 'Hours volunteered' },
    { value: s ? String(s.sessions) : '—', label: 'Events completed' },
    { value: s && Number(s.avg_rating) > 0 ? `${s.avg_rating} ★` : '—', label: 'Avg feedback rating' },
  ];

  const impactNumbers = [
    { num: s ? num(s.beneficiaries) : '—', lbl: 'Beneficiaries reached' },
    { num: s ? `${Number(s.attendance_pct)}%` : '—', lbl: 'Shift attendance rate' },
    { num: s ? String(s.training_completions) : '—', lbl: 'Training completions' },
    { num: s ? String(s.certificates_issued) : '—', lbl: 'Certificates issued' },
    { num: s ? String(s.cities) : '—', lbl: 'Cities reached' },
    { num: s ? String(s.partner_organizations) : '—', lbl: 'Partner organisations' },
  ];

  /*
   * Two kinds of tile, and they are never confused for one another.
   *
   * A photo tile is an actual photograph a coordinator uploaded and an admin
   * marked public. A programme tile is a data card — the programme's own
   * hours, turnout and beneficiaries — shown where no photograph exists.
   * Earlier these looked identical, so five gradient rectangles read as five
   * stock photos the system did not have.
   */
  const photoTiles = (data?.gallery ?? []).map((photo, i) => ({
    key: `photo-${i}`,
    url: photo.url,
    caption: photo.caption,
  }));
  const programmeTiles = (data?.programs ?? []).slice(0, Math.max(0, 6 - photoTiles.length));

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fbf6ec' }}>
      {/* ── Join / Admin bar — lifted to the top ─────────────────────────── */}
      <Box
        sx={{
          bgcolor: tokens.ink,
          display: 'flex',
          gap: 1.5,
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          py: { xs: 2.5, md: 3 },
          px: { xs: 3, sm: 6, md: 12, lg: 16 },
        }}
      >
        <Typography sx={{ color: 'rgba(255,255,255,0.75)', flex: 1, minWidth: 200, fontSize: '1.05rem' }}>
          <Box component="strong" sx={{ color: '#fff' }}>Want to make a difference?</Box>
          <br />
          Join {s ? `${s.volunteers}+ volunteers` : 'the volunteers'} already creating impact with Parinaam.
        </Typography>
        <Button variant="pill" component={RouterLink} to="/login" sx={{ px: 3 }}>
          Join as a Volunteer
        </Button>
        <Button
          component={RouterLink}
          to="/admin/login"
          sx={{
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff',
            borderRadius: 999,
            px: 3,
            py: 1,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Admin Login
        </Button>
      </Box>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          ...SECTION_PAD,
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg,#0f2b2d 0%,#1a4a4d 100%)',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 70% 30%, rgba(217,108,63,0.22), transparent 55%)',
            pointerEvents: 'none',
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box
            component="img"
            src="/parinaam-logo-dark.svg"
            alt="Parinaam Foundation"
            sx={{ height: 56, display: 'block', mb: 2 }}
          />
          <Typography
            sx={{
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(217,108,63,0.9)',
              fontWeight: 700,
              mb: 2,
            }}
          >
            {new Date().getFullYear()} Impact Report
          </Typography>
          <Typography
            component="h1"
            sx={{
              fontFamily: SERIF,
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              color: '#fff',
              lineHeight: 1.05,
              maxWidth: '16ch',
              mb: 2.5,
            }}
          >
            Every hour counts.
            <br />
            Every volunteer matters.
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '1.05rem',
              lineHeight: 1.75,
              maxWidth: '38rem',
              mb: 5,
            }}
          >
            Parinaam connects passionate people with meaningful opportunities — building stronger
            communities one activity at a time. Here’s the impact our volunteers created this year.
          </Typography>
          <Box sx={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {heroStats.map((stat) => (
              <Box key={stat.label}>
                <Box component="strong" sx={{ display: 'block', fontSize: '2.5rem', fontFamily: SERIF, color: '#fff' }}>
                  {stat.value}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: '0.82rem',
                    color: 'rgba(255,255,255,0.55)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {stat.label}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Our Impact ───────────────────────────────────────────────────── */}
      <Box sx={{ ...SECTION_PAD, bgcolor: 'rgba(255,252,247,0.9)' }}>
        <SectionLabel>Our Impact</SectionLabel>
        <SectionTitle>What we achieved together</SectionTitle>
        <SectionSub>
          From health camps to digital literacy, our volunteers showed up, gave their best and made
          a difference in hundreds of lives.
        </SectionSub>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 2,
          }}
        >
          {impactNumbers.map((card) => (
            <Box
              key={card.lbl}
              sx={{
                p: 3,
                borderRadius: '1.25rem',
                textAlign: 'center',
                bgcolor: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(19,35,37,0.08)',
              }}
            >
              <Typography sx={{ fontFamily: SERIF, fontSize: '2.8rem', lineHeight: 1, mb: 0.5, color: tokens.accentStrong }}>
                {card.num}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.82rem',
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                {card.lbl}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── From the Field ───────────────────────────────────────────────── */}
      <Box sx={SECTION_PAD}>
        <SectionLabel>From the Field</SectionLabel>
        <SectionTitle>Moments that mattered</SectionTitle>
        <SectionSub>
          A glimpse into the activities, smiles and hard work our volunteers brought to every event.
          {photoTiles.length === 0
            ? ' Photographs appear here as coordinators upload them and an administrator clears them for publication.'
            : ''}
        </SectionSub>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 2,
          }}
        >
          {photoTiles.map((tile) => (
            <Box
              key={tile.key}
              sx={{
                borderRadius: '1.1rem',
                overflow: 'hidden',
                position: 'relative',
                aspectRatio: '4 / 3',
                transition: 'transform 200ms ease, box-shadow 200ms ease',
                '&:hover': { transform: 'scale(1.02)', boxShadow: tokens.shadow },
              }}
            >
              <Box
                component="img"
                src={tile.url}
                alt={tile.caption ?? 'Volunteers in the field'}
                loading="lazy"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(15,43,45,0.7) 0%, transparent 50%)',
                }}
              />
              <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, p: 2, color: '#fff' }}>
                <Box component="strong" sx={{ display: 'block', fontSize: '0.92rem', fontWeight: 700 }}>
                  {tile.caption ?? 'From the field'}
                </Box>
                <Box component="span" sx={{ fontSize: '0.78rem', opacity: 0.75 }}>
                  Photographed by the field coordinator
                </Box>
              </Box>
            </Box>
          ))}

          {programmeTiles.map((p, i) => (
            <Box
              key={p.name}
              sx={{
                borderRadius: '1.1rem',
                position: 'relative',
                overflow: 'hidden',
                aspectRatio: '4 / 3',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                p: 2.5,
                color: '#fff',
                background: GRADIENTS[(photoTiles.length + i) % GRADIENTS.length],
                transition: 'transform 200ms ease, box-shadow 200ms ease',
                '&:hover': { transform: 'scale(1.02)', boxShadow: tokens.shadow },
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  fontSize: '0.62rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  bgcolor: 'rgba(255,255,255,0.18)',
                  borderRadius: 999,
                  px: 1,
                  py: 0.25,
                }}
              >
                Programme
              </Box>
              <Typography sx={{ fontFamily: SERIF, fontSize: '2rem', lineHeight: 1 }}>
                {p.beneficiaries.toLocaleString('en-IN')}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', opacity: 0.8, mb: 1 }}>
                beneficiaries reached
              </Typography>
              <Box component="strong" sx={{ display: 'block', fontSize: '0.92rem', fontWeight: 700 }}>
                {p.name}
              </Box>
              <Box component="span" sx={{ fontSize: '0.78rem', opacity: 0.75 }}>
                {p.volunteers} volunteer turnouts · {Number(p.hours)} hours
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Volunteer Voices (published testimonials only — BR-16) ───────── */}
      {(data?.testimonials.length ?? 0) > 0 && (
        <Box sx={{ ...SECTION_PAD, bgcolor: 'rgba(255,252,247,0.9)' }}>
          <SectionLabel>Volunteer Voices</SectionLabel>
          <SectionTitle>What our volunteers say</SectionTitle>
          <SectionSub>Real experiences from the people who made it happen.</SectionSub>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 2.5,
            }}
          >
            {(data?.testimonials ?? []).map((t, i) => (
              <Box
                key={i}
                sx={{
                  p: 3,
                  borderRadius: '1.25rem',
                  bgcolor: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(19,35,37,0.08)',
                }}
              >
                <Typography sx={{ fontSize: '1rem', lineHeight: 1.75, fontStyle: 'italic', mb: 2.5 }}>
                  <Box component="span" sx={{ fontSize: '1.5rem', color: tokens.accent, fontStyle: 'normal', mr: 0.25 }}>
                    “
                  </Box>
                  {t.comments}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      color: '#fff',
                      background: GRADIENTS[i % GRADIENTS.length],
                    }}
                  >
                    {initials(t.attribution)}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.attribution}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                      {t.program_name} &nbsp;·&nbsp; Rating: {'★'.repeat(t.overall_rating)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Your Voice Matters ───────────────────────────────────────────── */}
      <Box
        sx={{
          ...SECTION_PAD,
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg,#0f2b2d 0%,#1a4a4d 100%)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 80% 50%, rgba(217,108,63,0.18), transparent 55%)',
            pointerEvents: 'none',
          }}
        />
        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 640 }}>
          <SectionLabel sx={{ color: 'rgba(217,108,63,0.85)' }}>Your Voice Matters</SectionLabel>
          <SectionTitle sx={{ color: '#fff', mb: 1 }}>Share your experience</SectionTitle>
          <Typography sx={{ color: 'rgba(255,255,255,0.68)', mb: 4, fontSize: '1rem', lineHeight: 1.75 }}>
            Volunteered with Parinaam recently? Tell us what you loved, what we can improve, and how
            likely you are to recommend us. Your feedback shapes every future event.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.75, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="pill"
              component={RouterLink}
              to="/login"
              sx={{ minWidth: '12rem', fontSize: '1rem' }}
            >
              ✎ Submit Feedback
            </Button>
            <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem' }}>
              Sign in to rate a session you attended
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 4, mt: 4, flexWrap: 'wrap' }}>
            {[
              { value: s ? String(s.feedback_responses) : '—', label: 'Responses so far' },
              { value: s && Number(s.avg_rating) > 0 ? `${s.avg_rating}★` : '—', label: 'Average rating' },
              { value: s && Number(s.avg_nps) > 0 ? String(s.avg_nps) : '—', label: 'Avg NPS score' },
            ].map((stat) => (
              <Box key={stat.label}>
                <Box component="strong" sx={{ color: '#fff', fontSize: '1.4rem' }}>
                  {stat.value}
                </Box>
                <Box component="span" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', display: 'block' }}>
                  {stat.label}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: { xs: 3, sm: 6, md: 12, lg: 16 },
          py: 2,
          bgcolor: tokens.ink,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
          © {new Date().getFullYear()} Parinaam Foundation &nbsp;·&nbsp; parinaam.org
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
          Figures update automatically from verified attendance records.
        </Typography>
      </Box>
    </Box>
  );
}

function SectionLabel({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Typography
      sx={{
        fontSize: '0.75rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: tokens.accentStrong,
        fontWeight: 700,
        mb: 1,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

function SectionTitle({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Typography
      component="h2"
      sx={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4vw, 3rem)', mb: 1, ...sx }}
    >
      {children}
    </Typography>
  );
}

function SectionSub({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ color: 'text.secondary', mb: 5, fontSize: '1rem', maxWidth: '44rem' }}>
      {children}
    </Typography>
  );
}
