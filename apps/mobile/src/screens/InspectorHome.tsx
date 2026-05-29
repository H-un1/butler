import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { listMyInspections, type InspectionListItem } from '../api/client';

type Props = {
  token?: string;
};

export function InspectorHome({ token }: Props) {
  const [items, setItems] = useState<InspectionListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listMyInspections(token)
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [token]);

  if (!token) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>로그인 필요</Text>
        <Text style={styles.body}>
          관리자에게 점검자(INSPECTOR) 계정을 발급받아 토큰을 설정하세요.
        </Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>불러오기 실패</Text>
        <Text style={styles.body}>{err}</Text>
      </View>
    );
  }

  if (!items) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>불러오는 중…</Text>
      </View>
    );
  }

  return (
    <ScrollView>
      <Text style={styles.heading}>점검 의뢰 {items.length}건</Text>
      {items.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.body}>아직 배정된 점검 의뢰가 없습니다.</Text>
        </View>
      )}
      {items.map((i) => (
        <View key={i.id} style={styles.card}>
          <Text style={styles.title}>
            {i.type} · {i.status}
          </Text>
          <Text style={styles.body}>일정: {new Date(i.scheduledAt).toLocaleString('ko-KR')}</Text>
          <Text style={styles.body}>물건: {i.propertyId}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: '#191f28',
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
});
