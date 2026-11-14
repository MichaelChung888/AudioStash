import type { AudioFormat, DownloadOptions } from '@audiostash/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { Toggle, Touchable } from './components.tsx';
import { colors, fonts, text } from './theme.ts';

const FORMAT_CHOICES: { value: AudioFormat; title: string; detail: string }[] = [
  { value: 'best', title: 'Best available', detail: 'The original audio, never converted. From YouTube this is usually Opus.' },
  { value: 'm4a', title: 'M4A (AAC)', detail: 'Converted, which loses a little quality. For players that cannot play Opus.' },
  { value: 'mp3', title: 'MP3', detail: 'Converted, which loses a little quality. Plays on almost anything.' },
];

export function formatTitle(format: AudioFormat): string {
  return FORMAT_CHOICES.find((choice) => choice.value === format)?.title ?? format;
}

// "Details, cover, lyrics" for the settings screen.
export function extrasSummary(options: DownloadOptions): string {
  const parts = [options.metadata && 'details', options.cover && 'cover', options.lyrics && 'lyrics', options.removeNonMusic && 'skip non-music'].filter(
    (part): part is string => Boolean(part),
  );
  if (parts.length === 0) return 'Nothing';
  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

interface DownloadOptionsFormProps {
  options: DownloadOptions;
  onChange: (options: DownloadOptions) => void;
  // SponsorBlock only knows YouTube videos, so the option is hidden for other sources.
  showSkipNonMusic?: boolean;
}

export function DownloadOptionsForm({ options, onChange, showSkipNonMusic = true }: DownloadOptionsFormProps) {
  const change = (patch: Partial<DownloadOptions>) => onChange({ ...options, ...patch });
  return (
    <View style={styles.form}>
      <Text style={text.label}>Audio format</Text>
      <View style={styles.choices}>
        {FORMAT_CHOICES.map((choice) => (
          <FormatChoice key={choice.value} {...choice} selected={options.format === choice.value} onPress={() => change({ format: choice.value })} />
        ))}
      </View>

      <Text style={[text.label, styles.groupLabel]}>Add to the file</Text>
      <View>
        <OptionToggle
          title="Song details"
          detail="Title, artist, album, year and track number"
          value={options.metadata}
          onChange={(metadata) => change({ metadata })}
        />
        <OptionToggle title="Cover art" detail="Saved inside the file" value={options.cover} onChange={(cover) => change({ cover })} />
        <OptionToggle title="Lyrics" detail="Synced lyrics, when LRCLIB has them" value={options.lyrics} onChange={(lyrics) => change({ lyrics })} />
        {showSkipNonMusic ? (
          <OptionToggle
            title="Skip non-music parts"
            detail="Cuts talking and intros from music videos, using SponsorBlock"
            value={options.removeNonMusic}
            onChange={(removeNonMusic) => change({ removeNonMusic })}
          />
        ) : null}
      </View>
    </View>
  );
}

interface FormatChoiceProps {
  title: string;
  detail: string;
  value: AudioFormat;
  selected: boolean;
  onPress: () => void;
}

function FormatChoice({ title, detail, value, selected, onPress }: FormatChoiceProps) {
  return (
    <Touchable
      role="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, { borderColor: selected ? colors.accent : colors.divider }]}
    >
      <Radio selected={selected} />
      <View style={styles.choiceText}>
        <View style={styles.choiceTitle}>
          <Text style={text.title}>{title}</Text>
          {value === 'best' ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Recommended</Text>
            </View>
          ) : null}
        </View>
        <Text style={text.secondary}>{detail}</Text>
      </View>
    </Touchable>
  );
}

export function Radio({ selected }: { selected: boolean }) {
  return <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.radioIdle }]}>{selected ? <View style={styles.radioDot} /> : null}</View>;
}

function OptionToggle({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.choiceText}>
        <Text style={text.title}>{title}</Text>
        <Text style={text.secondary}>{detail}</Text>
      </View>
      <Toggle label={title} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  groupLabel: { marginTop: 8 },
  choices: { gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5 },
  choiceText: { flex: 1, minWidth: 0, gap: 2 },
  choiceTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 20, height: 20, marginTop: 1, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.accentTint },
  tagText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.accent },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
});
