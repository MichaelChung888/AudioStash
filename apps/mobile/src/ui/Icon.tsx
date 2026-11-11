import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from './theme.ts';

// Paths copied from the design files so the app matches them exactly. 24×24, stroked.
const ICONS = {
  home: () => <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  search: () => (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  download: () => <Path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  playlists: () => (
    <>
      <Path d="M3 6h13M3 12h9M3 18h9" />
      <Circle cx={17.5} cy={17.5} r={2.5} />
      <Path d="M20 17.5V9l-2.5.8" />
    </>
  ),
  user: () => (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  close: () => <Path d="M6 6l12 12M18 6 6 18" />,
  plus: () => <Path d="M12 5v14M5 12h14" />,
  plusCircle: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 8v8M8 12h8" />
    </>
  ),
  link: () => (
    <>
      <Path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <Path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  folder: () => <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  upload: () => (
    <>
      <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M12 10v6M9 13l3 3 3-3" />
    </>
  ),
  computer: () => (
    <>
      <Rect x={3} y={4} width={18} height={12} rx={2} />
      <Path d="M8 20h8M12 16v4" />
    </>
  ),
  phone: () => (
    <>
      <Rect x={7} y={2.5} width={10} height={19} rx={2} />
      <Path d="M11 18.5h2" />
    </>
  ),
  back: () => <Path d="m15 18-6-6 6-6" />,
  forward: () => <Path d="m9 6 6 6-6 6" />,
  down: () => <Path d="m6 9 6 6 6-6" />,
  up: () => <Path d="m18 15-6-6-6 6" />,
  shuffle: () => (
    <>
      <Path d="M3 7h3c2 0 3 1 4 2.5l4 6c1 1.5 2 2.5 4 2.5h3" />
      <Path d="M3 18h3c1.3 0 2.2-.5 3-1.3M21 7h-3c-1.3 0-2.2.5-3 1.3" />
      <Path d="m18 4 3 3-3 3m0 5 3 3-3 3" />
    </>
  ),
  repeat: () => (
    <>
      <Path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15" />
      <Path d="m7 22-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  previous: (color: string) => (
    <>
      <Path d="M19 5v14L9 12z" fill={color} />
      <Path d="M5 5v14" />
    </>
  ),
  next: (color: string) => (
    <>
      <Path d="M5 5v14l10-7z" fill={color} />
      <Path d="M19 5v14" />
    </>
  ),
  play: (color: string) => <Path d="M8 5v14l11-7z" fill={color} stroke="none" />,
  pause: (color: string) => (
    <>
      <Rect x={6} y={4.5} width={4} height={15} rx={1} fill={color} stroke="none" />
      <Rect x={14} y={4.5} width={4} height={15} rx={1} fill={color} stroke="none" />
    </>
  ),
  moreHorizontal: (color: string) => (
    <>
      <Circle cx={5} cy={12} r={1.8} fill={color} stroke="none" />
      <Circle cx={12} cy={12} r={1.8} fill={color} stroke="none" />
      <Circle cx={19} cy={12} r={1.8} fill={color} stroke="none" />
    </>
  ),
  moreVertical: (color: string) => (
    <>
      <Circle cx={12} cy={5} r={1.8} fill={color} stroke="none" />
      <Circle cx={12} cy={12} r={1.8} fill={color} stroke="none" />
      <Circle cx={12} cy={19} r={1.8} fill={color} stroke="none" />
    </>
  ),
  inLibrary: (color: string) => (
    <>
      <Circle cx={12} cy={12} r={10} fill={color} stroke="none" />
      <Path d="m7.5 12.5 3 3 6-6.5" stroke={colors.onAccent} strokeWidth={2.2} />
    </>
  ),
  music: () => (
    <>
      <Path d="M9 18V5l11-2v13" />
      <Circle cx={6} cy={18} r={3} />
      <Circle cx={17} cy={16} r={3} />
    </>
  ),
  edit: () => <Path d="M4 20h4L19 9l-4-4L4 16z" />,
  reorder: () => <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  trash: () => <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  retry: () => <Path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />,
} satisfies Record<string, (color: string) => ReactNode>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name](color)}
    </Svg>
  );
}

// The bars shown in place of the track number for the song that is playing.
export function PlayingBars({ color = colors.accent }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill={color}>
      <Rect x={2} y={6} width={3} height={8} rx={1} />
      <Rect x={6.5} y={2} width={3} height={12} rx={1} />
      <Rect x={11} y={8} width={3} height={6} rx={1} />
    </Svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={7} fill={colors.accent} />
      <Path d="M6.5 9.5v11l8.5-5.5z" fill={colors.onAccent} stroke={colors.onAccent} strokeWidth={1.2} strokeLinejoin="round" />
      <Circle cx={18.5} cy={13} r={2.2} fill={colors.onAccent} />
      <Path d="M20.7 13V6.2c1.6.3 2.6 1.3 2.6 2.9" fill="none" stroke={colors.onAccent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
