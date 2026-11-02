import { space, typeScale } from '@hufra/brand';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

/** Placeholder first screen until the real onboarding lands in Phase 5.4. */
export function Welcome() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.brand.primary }]}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.brand.onPrimary }]}>
          حفرة
        </Text>
        <Text style={[styles.tagline, { color: theme.brand.onPrimary }]}>كل حفرة لها موقع.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[7] },
  title: { fontSize: typeScale.display.size, lineHeight: typeScale.display.lineHeight, fontWeight: '700' },
  tagline: { fontSize: typeScale.title3.size, lineHeight: typeScale.title3.lineHeight, fontWeight: '600', textAlign: 'center' },
});
