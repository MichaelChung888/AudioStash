import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text } from 'react-native';
import { Button, Field, Sheet } from './components.tsx';
import { colors, fonts } from './theme.ts';

interface NamePromptProps {
  visible: boolean;
  title: string;
  action: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

// Android has no text prompt dialog, so naming a playlist uses this sheet.
export function NamePrompt({ visible, title, action, initial = '', onSubmit, onClose }: NamePromptProps) {
  const [name, setName] = useState(initial);

  useEffect(() => {
    if (visible) setName(initial);
  }, [visible, initial]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onClose();
    onSubmit(trimmed);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Sheet onClose={onClose}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Field value={name} onChangeText={setName} placeholder="Playlist name" autoFocus maxLength={200} returnKeyType="done" onSubmitEditing={submit} />
        <Button label={action} onPress={submit} disabled={!name.trim()} />
      </Sheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.headingSemibold, fontSize: 18, color: colors.text },
});
