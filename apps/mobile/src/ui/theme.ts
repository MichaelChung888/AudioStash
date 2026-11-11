import type { TextStyle } from 'react-native';

export const colors = {
  background: '#0B0C0E',
  surface: '#15171A',
  raised: '#1C1F23',
  divider: '#24282D',
  border: '#2E3238',
  radioIdle: '#4A5058',
  handle: '#3A3F46',
  backdrop: '#050506',
  text: '#F2F3F5',
  textSecondary: '#C9CDD2',
  textMuted: '#A3A9B1',
  textFaint: '#868D96',
  accent: '#F5B83D',
  onAccent: '#0B0C0E',
  accentTint: '#2A2418',
  online: '#4CC38A',
  danger: '#FF8A80',
  phone: '#6CB6FF',
  player: '#17122A',
  playerMuted: '#B4AECB',
  playerSoft: '#D6D1E8',
  playerFaint: '#8E87A8',
} as const;

// Android picks a custom font by family name, so each weight is its own family
// and fontWeight must not be set alongside it.
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  headingSemibold: 'SpaceGrotesk_600SemiBold',
  heading: 'SpaceGrotesk_700Bold',
} as const;

export const text = {
  screenTitle: { fontFamily: fonts.heading, fontSize: 28, letterSpacing: -0.56, color: colors.text },
  sectionTitle: { fontFamily: fonts.headingSemibold, fontSize: 20, letterSpacing: -0.2, color: colors.text },
  groupTitle: { fontFamily: fonts.headingSemibold, fontSize: 17, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  title: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  secondary: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  numeric: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export const TOUCH = 44;
