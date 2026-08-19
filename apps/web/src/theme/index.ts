import { alpha, createTheme } from '@mui/material/styles';

/**
 * Design tokens lifted verbatim from VMS_prototype_v2.html.
 * See docs/01-design-document.md §8.1 for the mapping table.
 */
export const tokens = {
  ink: '#0f2b2d',
  accent: '#d96c3f',
  accentStrong: '#bc5328',
  mint: '#8db8a6',
  textMain: '#132325',
  textMuted: '#5e6a62',
  panel: 'rgba(255,252,247,0.82)',
  success: '#1d6b4d',
  info: '#3a60a0',
  bgGradient:
    'radial-gradient(circle at top left, rgba(217,108,63,0.32), transparent 28%),' +
    'radial-gradient(circle at bottom right, rgba(141,184,166,0.34), transparent 24%),' +
    'linear-gradient(135deg, #fbf6ec 0%, #efe2cf 48%, #f4ede2 100%)',
  shadow: '0 24px 80px rgba(19,35,37,0.16)',
  shadowSm: '0 8px 24px rgba(19,35,37,0.10)',
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
    primary: { main: tokens.ink, dark: '#0a1e20', contrastText: '#ffffff' },
    secondary: { main: tokens.accent, dark: tokens.accentStrong, contrastText: '#ffffff' },
    success: { main: tokens.success, light: tokens.mint },
    info: { main: tokens.info },
    text: { primary: tokens.textMain, secondary: tokens.textMuted },
    background: { default: '#f4ede2', paper: '#fffcf7' },
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

  shape: { borderRadius: 16 },

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
            boxShadow: '0 14px 30px rgba(188,83,40,0.25)',
            transition: 'transform 160ms ease, box-shadow 160ms ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 18px 36px rgba(188,83,40,0.34)',
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
          borderRadius: 12,
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
