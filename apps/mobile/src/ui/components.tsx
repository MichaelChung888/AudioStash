import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon.tsx';
import { colors, fonts, TOUCH, text } from './theme.ts';

type TouchableProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

export function Touchable({ style, ...props }: TouchableProps) {
  return <Pressable {...props} style={({ pressed }) => [style, pressed && styles.pressed, props.disabled && styles.disabled]} />;
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  // Draws a filled circle behind the icon, as on the "+" buttons in screen headers.
  circle?: number;
  disabled?: boolean;
}

export function IconButton({ icon, label, onPress, color = colors.text, size = 22, circle, disabled }: IconButtonProps) {
  const glyph = <Icon name={icon} size={size} color={color} />;
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={4} style={styles.iconButton}>
      {circle ? <View style={[styles.circle, { width: circle, height: circle, borderRadius: circle / 2 }]}>{glyph}</View> : glyph}
    </Touchable>
  );
}

// The round download button on chart and search rows.
export function DownloadButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <View style={styles.downloadRing}>
        <Icon name="download" size={18} color={colors.textSecondary} />
      </View>
    </Touchable>
  );
}

export function InLibraryMark() {
  return (
    <View accessible accessibilityLabel="In your library" style={styles.iconButton}>
      <Icon name="inLibrary" size={22} color={colors.accent} />
    </View>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.accent : colors.raised }]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.onAccent : colors.textSecondary }]}>{label}</Text>
    </Touchable>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.toggleHit}
    >
      <View style={[styles.toggleTrack, { justifyContent: value ? 'flex-end' : 'flex-start', backgroundColor: value ? colors.accent : colors.border }]}>
        <View style={[styles.toggleKnob, { backgroundColor: value ? colors.onAccent : colors.textMuted }]} />
      </View>
    </Pressable>
  );
}

export function StatusDot({ online }: { online: boolean }) {
  return <View style={[styles.dot, { backgroundColor: online ? colors.online : colors.textFaint }]} />;
}

interface ProgressBarProps {
  // 0 to 1. Null shows a moving segment for work whose length is unknown.
  value: number | null;
  color?: string;
  track?: string;
  height?: number;
}

export function ProgressBar({ value, color = colors.accent, track = colors.border, height = 4 }: ProgressBarProps) {
  const fill: ViewStyle = value === null ? { width: '30%', marginLeft: '20%' } : { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` };
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]} />
    </View>
  );
}

interface CoverProps {
  uri?: string | null;
  color?: string | null;
  size: number;
  radius?: number;
}

export function Cover({ uri, color, size, radius = 6 }: CoverProps) {
  const style = { width: size, height: size, borderRadius: radius, backgroundColor: color ?? colors.raised };
  if (!uri) return <View style={style} />;
  return <Image source={{ uri }} style={style} contentFit="cover" transition={120} recyclingKey={uri} />;
}

export interface CoverTile {
  uri: string | null;
  color: string | null;
}

// A playlist's cover: the first four songs' covers in a 2×2 grid, or one cover when there are fewer.
export function CoverGrid({ tiles, size, radius = 8 }: { tiles: readonly CoverTile[]; size: number; radius?: number }) {
  const first = tiles[0];
  if (tiles.length < 4) return <Cover uri={first?.uri} color={first?.color} size={size} radius={radius} />;
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {tiles.slice(0, 4).map((tile, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the four tiles never reorder.
        <Cover key={i} uri={tile.uri} color={tile.color} size={half} radius={0} />
      ))}
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'outline' | 'quiet' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, icon, variant = 'primary', busy, disabled, style }: ButtonProps) {
  const look = BUTTON_LOOKS[variant];
  return (
    <Touchable accessibilityRole="button" onPress={onPress} disabled={disabled || busy} style={[styles.button, look.container, style]}>
      {busy ? <ActivityIndicator color={look.text.color} /> : icon ? <Icon name={icon} size={20} color={look.text.color} strokeWidth={2.2} /> : null}
      <Text style={[styles.buttonText, look.text]}>{label}</Text>
    </Touchable>
  );
}

const BUTTON_LOOKS = {
  primary: { container: { backgroundColor: colors.accent, height: 52, borderRadius: 26 }, text: { color: colors.onAccent, fontSize: 16 } },
  outline: { container: { borderWidth: 1, borderColor: colors.accent, height: 36, borderRadius: 18, paddingHorizontal: 14 }, text: { color: colors.accent } },
  quiet: { container: { backgroundColor: colors.raised, height: 48, borderRadius: 12 }, text: { color: colors.text } },
  danger: { container: { height: TOUCH, paddingHorizontal: 16 }, text: { color: colors.danger } },
} as const;

// A full screen below the status bar. Tab screens leave the bottom to the tab bar.
export function Screen({ children, bottom = false, color = colors.background }: { children: ReactNode; bottom?: boolean; color?: string }) {
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: color, paddingTop: insets.top, paddingBottom: bottom ? insets.bottom : 0 }}>{children}</View>;
}

type FieldProps = Omit<TextInputProps, 'style'> & { onClear?: () => void };

export function Field({ onClear, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { borderColor: focused ? colors.accent : colors.divider }]}>
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={styles.fieldInput}
      />
      {onClear && props.value ? <IconButton icon="close" label="Clear" onPress={onClear} color={colors.textMuted} size={18} /> : null}
    </View>
  );
}

// A panel that slides over the screen from the bottom. Tapping above it closes it.
export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.sheetScreen}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.sheetBackdrop} />
      <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
        <View style={styles.sheetHandle} />
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

export function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={text.screenTitle}>
        {title}
      </Text>
      <View style={styles.headerActions}>{children}</View>
    </View>
  );
}

export function Message({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <View style={styles.message}>
      <Text style={[text.title, { textAlign: 'center' }]}>{title}</Text>
      {detail ? <Text style={[text.secondary, { textAlign: 'center' }]}>{detail}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  iconButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  circle: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  downloadRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 13 },
  toggleHit: { width: 52, height: TOUCH, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toggleTrack: { width: 44, height: 26, padding: 3, borderRadius: 13, flexDirection: 'row' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: fonts.bold, fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 8, paddingLeft: 20, paddingRight: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  message: { alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 48 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingLeft: 14,
    paddingRight: 2,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  fieldInput: { flex: 1, minWidth: 0, height: 44, padding: 0, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  sheetScreen: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5, 5, 6, 0.72)' },
  sheet: { gap: 16, paddingTop: 8, paddingHorizontal: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.handle },
});
