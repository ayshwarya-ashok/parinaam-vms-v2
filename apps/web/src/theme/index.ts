import { alpha, createTheme } from '@mui/material/styles';

/**
 * Design tokens — the brand palette derived from parinaam-logo.svg.
 * See docs/10-brand-palette.md; the toast styling is deliberately exempt.
 */
export const tokens = {
  ink: '#1F2B36',
  accent: '#1E7AB2',
  accentStrong: '#1B6EA0',
  mint: '#0AAABA',
  textMain: '#445563',
  textMuted: '#5E6E7E',
  panel: 'rgba(255,255,255,0.82)',
  success: '#1E7F4F',
  info: '#1B6EA0',
  /** The logo's centre dot — one highlight per screen, never text. */
  sun: '#FFD036',
  bgGradient:
    'radial-gradient(circle at top left, rgba(30,122,178,0.32), transparent 28%),' +
    'radial-gradient(circle at bottom right, rgba(10,170,186,0.34), transparent 24%),' +
    'linear-gradient(135deg, #f7fafd 0%, #e3eef7 48%, #f0f6fb 100%)',
  shadow: '0 24px 80px rgba(31,43,54,0.16)',
  shadowSm: '0 8px 24px rgba(31,43,54,0.10)',
} as const;

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    /** The prototype's gradient pill CTA. */
    pill: true;
    /** The prototype's translucent secondary pill. */
    pillOutlined: true;
  }
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.ink, dark: '#16202A', contrastText: '#ffffff' },
    secondary: { main: tokens.accent, dark: tokens.accentStrong, contrastText: '#ffffff' },
    success: { main: tokens.success, light: tokens.mint },
    info: { main: tokens.info },
    text: { primary: tokens.textMain, secondary: tokens.textMuted },
    background: { default: '#F4F7FA', paper: '#FFFFFF' },
    divider: alpha(tokens.textMain, 0.1),
  },

  typography: {
    fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
    h1: { fontFamily: '"Source Serif 4", Georgia, serif', fontWeight: 600, lineHeight: 1.05 },
    h2: { fontFamily: '"Source Serif 4", Georgia, serif', fontWeight: 600, lineHeight: 1.1 },
    h3: { fontFamily: '"Source Serif 4", Georgia, serif', fontWeight: 600 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    // The prototype's uppercase eyebrow labels.
    overline: {
      letterSpacing: '0.18em',
      fontWeight: 700,
      color: tokens.accentStrong,
      fontSize: '0.8rem',
    },
    button: { textTransform: 'none', fontWeight: 700 },
  },

  // NOTE: sx numeric borderRadius values MULTIPLY this base (sx borderRadius: 4
  // renders at 4 x base px). Screens use values 2-6, so a base of 3 yields
  // 6-18px corners across cards, dialogs and panels.
  shape: { borderRadius: 3 },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: tokens.bgGradient,
          backgroundAttachment: 'fixed',
          minHeight: '100vh',
        },
      },
    },

    MuiButton: {
      variants: [
        {
          props: { variant: 'pill' },
          style: {
            borderRadius: 999,
            padding: '0.75rem 1.5rem',
            color: '#fff',
            background: `linear-gradient(135deg, ${tokens.accent} 0%, ${tokens.accentStrong} 100%)`,
            boxShadow: '0 14px 30px rgba(27,110,160,0.25)',
            transition: 'transform 160ms ease, box-shadow 160ms ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 18px 36px rgba(27,110,160,0.34)',
              background: `linear-gradient(135deg, ${tokens.accent} 0%, ${tokens.accentStrong} 100%)`,
            },
            '&.Mui-disabled': { opacity: 0.5, color: '#fff' },
          },
        },
        {
          props: { variant: 'pillOutlined' },
          style: {
            borderRadius: 999,
            padding: '0.75rem 1.5rem',
            color: tokens.textMain,
            border: `1px solid ${alpha(tokens.textMain, 0.12)}`,
            background: 'rgba(255,255,255,0.65)',
            transition: 'transform 160ms ease, border-color 160ms ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              borderColor: alpha(tokens.textMain, 0.28),
              background: 'rgba(255,255,255,0.9)',
            },
          },
        },
      ],
      defaultProps: { disableElevation: true },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: { boxShadow: tokens.shadowSm },
        elevation8: { boxShadow: tokens.shadow },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
        // The prototype's filter chips: pill outline, ink fill when active.
        outlined: {
          background: 'rgba(255,255,255,0.6)',
          borderColor: alpha(tokens.textMain, 0.15),
          '&:hover': { background: 'rgba(255,255,255,0.92)' },
        },
      },
    },

    MuiTextField: {
      defaultProps: { size: 'small' },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          background: 'rgba(255,255,255,0.75)',
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha(tokens.accent, 0.7),
          },
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: { background: tokens.ink, boxShadow: 'none' },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontSize: '0.75rem',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: tokens.textMuted,
            fontWeight: 700,
            background: 'rgba(255,255,255,0.6)',
          },
        },
      },
    },
  },
});

/**
 * notistack's info variant carries "No changes to save" — the absence of an
 * outcome. Light grey on dark grey keeps it from reading as a second kind of
 * success, or as the blue that normally means "here is something you should
 * know": nothing happened, and the toast should look like nothing happened.
 */
export const neutralToastStyles = {
  '.notistack-MuiContent-info': {
    backgroundColor: '#e6e4e0',
    color: '#3d4744',
    fontWeight: 500,
    border: '1px solid rgba(19,35,37,0.12)',
    boxShadow: tokens.shadowSm,
  },
};
