import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { IconButton, Touchable } from './components.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { colors, fonts } from './theme.ts';

export interface MenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 48;

// A "more" button that opens a small menu below it.
export function MenuButton({
  label,
  items,
  icon = 'moreVertical',
  color = colors.textMuted,
}: {
  label: string;
  items: MenuItem[];
  icon?: IconName;
  color?: string;
}) {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const window = useWindowDimensions();

  function open() {
    anchor.current?.measureInWindow((x, y, width, height) => setPosition({ top: y + height, right: window.width - (x + width) }));
  }

  function choose(item: MenuItem) {
    setPosition(null);
    item.onPress();
  }

  const menuHeight = items.length * ITEM_HEIGHT + 16;

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <IconButton icon={icon} label={label} color={color} onPress={open} />
      </View>
      <Modal
        visible={position !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPosition(null)}
      >
        <Pressable accessibilityLabel="Close menu" onPress={() => setPosition(null)} style={StyleSheet.absoluteFill} />
        {position ? (
          <View
            accessibilityRole="menu"
            style={[styles.menu, { top: Math.min(position.top, window.height - menuHeight - 24), right: Math.max(8, position.right) }]}
          >
            {items.map((item) => (
              <View key={item.label}>
                {item.dividerBefore ? <View style={styles.divider} /> : null}
                <Touchable accessibilityRole="menuitem" onPress={() => choose(item)} style={styles.item}>
                  <Icon name={item.icon} size={20} color={item.danger ? colors.danger : colors.textSecondary} />
                  <Text style={[styles.label, item.danger ? { color: colors.danger } : null]}>{item.label}</Text>
                </Touchable>
              </View>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.raised,
    elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: ITEM_HEIGHT, paddingHorizontal: 16 },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  divider: { height: 1, marginVertical: 4, backgroundColor: colors.border },
});
