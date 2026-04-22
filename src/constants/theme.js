export const colors = {
  // Core — Splitzly brand (dark theme)
  primary: '#00C9B1',            // Teal — main accent
  primaryLight: 'rgba(0,201,177,0.12)', // Teal tint for backgrounds
  primaryDark: '#00A896',        // Darker teal for pressed states
  accent: '#00E5D0',             // Brighter teal highlight
  accentLight: 'rgba(0,229,208,0.12)',

  // Semantic
  settled: '#00C9B1',            // Teal = settled/positive
  settledBg: 'rgba(0,201,177,0.15)',
  pending: '#FF6B6B',            // Softer red for dark bg
  pendingBg: 'rgba(255,107,107,0.15)',

  // Dark backgrounds
  background: '#162032',         // Card surface
  surface: '#0D1B2A',            // Page background
  card: '#1A2B3C',               // Elevated card
  cardBorder: 'rgba(0,201,177,0.15)',

  // Borders & overlays
  border: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.65)',

  // Text
  text: '#F0F4F8',               // Primary text (near white)
  textSecondary: '#8FA3B8',      // Secondary text
  textMuted: '#556677',          // Muted/placeholder
  white: '#FFFFFF',

  // Nav
  headerBg: '#0D1B2A',
  tabBarBg: '#162032',

  // Navy (used in logo)
  navy: '#1B2B5E',
}

export const categoryColors = {
  Food:          { bg: 'rgba(234,179,8,0.15)',   dot: '#EAB308' },
  Rent:          { bg: 'rgba(59,130,246,0.15)',  dot: '#60A5FA' },
  Utilities:     { bg: 'rgba(236,72,153,0.15)',  dot: '#F472B6' },
  Transport:     { bg: 'rgba(16,185,129,0.15)',  dot: '#34D399' },
  Entertainment: { bg: 'rgba(139,92,246,0.15)',  dot: '#A78BFA' },
  Other:         { bg: 'rgba(148,163,184,0.15)', dot: '#94A3B8' },
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 999,
}

export const shadow = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
}

export const typography = {
  h1: { fontSize: 28, fontWeight: '800', color: '#F0F4F8', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', color: '#F0F4F8', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700', color: '#F0F4F8' },
  body: { fontSize: 15, fontWeight: '400', color: '#F0F4F8' },
  bodyBold: { fontSize: 15, fontWeight: '600', color: '#F0F4F8' },
  caption: { fontSize: 13, fontWeight: '400', color: '#8FA3B8' },
  small: { fontSize: 11, fontWeight: '500', color: '#556677' },
}
