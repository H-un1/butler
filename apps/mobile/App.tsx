import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { ROLES } from '@butler/shared';
import { InspectorHome } from './src/screens/InspectorHome';

// Phase 1 모바일 셸 — 점검자(INSPECTOR) 전용.
// 토큰은 일단 EXPO_PUBLIC_BUTLER_INSPECTOR_TOKEN 으로 주입 (개발용).
// M4 후속에서 OAuth-flow 화면으로 교체.
const DEV_TOKEN =
  // @ts-expect-error expo env
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BUTLER_INSPECTOR_TOKEN) || undefined;

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>버틀러 — 점검자 ({ROLES.INSPECTOR})</Text>
      <InspectorHome token={DEV_TOKEN} />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  brand: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3182F6',
    marginBottom: 24,
  },
});
