import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Radius, Spacing } from '../constants/theme';
import { detectLocale, t, Locale } from '../constants/i18n';

export default function HomeScreen() {
  const router = useRouter();
  const [myPools, setMyPools] = useState<{ id: string; name: string }[]>([]);
  const [locale] = useState<Locale>(detectLocale());

  useEffect(() => {
    AsyncStorage.getItem('my_pools').then(raw => {
      if (raw) setMyPools(JSON.parse(raw));
    });
  }, []);

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <View style={s.hero}>
          <Text style={s.ball}>🏆</Text>
          <Text style={s.title}>MatchPool</Text>
          <Text style={s.sub}>{t('tagline', locale)}</Text>
          <Text style={s.dates}>11 Jun – 19 Jul 2026</Text>
        </View>

        {/* ACTIONS */}
        <TouchableOpacity style={s.btnPrimary} onPress={() => router.push('/create')}>
          <Text style={s.btnPrimaryText}>+ {t('createPool', locale)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btnSecondary} onPress={() => router.push('/join')}>
          <Text style={s.btnSecondaryText}>{t('joinPool', locale)}</Text>
        </TouchableOpacity>

        {/* MY POOLS */}
        {myPools.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Mis porras</Text>
            {myPools.map(p => (
              <TouchableOpacity key={p.id} style={s.poolCard} onPress={() => router.push(`/pool/${p.id}`)}>
                <Text style={s.poolName}>{p.name}</Text>
                <Text style={s.poolArrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* HOW TO PLAY */}
        <View style={s.rules}>
          <Text style={s.rulesTitle}>⚽ {t('howToPlay', locale)}</Text>
          <Text style={s.rulesItem}>🎯 {t('score3', locale)}</Text>
          <Text style={s.rulesItem}>✓ {t('score1', locale)}</Text>
          <Text style={s.rulesItem}>🔥 {t('moreLater', locale)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  scroll:     { paddingHorizontal: Spacing.lg, paddingTop: 80, paddingBottom: 40, gap: Spacing.md },
  hero:       { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8 },
  ball:       { fontSize: 72 },
  title:      { fontSize: 42, fontWeight: '900', color: Colors.gold, letterSpacing: -1 },
  sub:        { fontSize: 16, color: Colors.muted, textAlign: 'center' },
  dates:      { fontSize: 13, color: Colors.green, fontWeight: '600', marginTop: 4 },
  btnPrimary: { backgroundColor: Colors.gold, borderRadius: Radius.xl, paddingVertical: 18, alignItems: 'center' },
  btnPrimaryText: { fontSize: 17, fontWeight: '800', color: Colors.bg },
  btnSecondary: { backgroundColor: Colors.card, borderRadius: Radius.xl, paddingVertical: 18, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  btnSecondaryText: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  section:    { gap: Spacing.sm, marginTop: Spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  poolCard:   { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  poolName:   { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
  poolArrow:  { fontSize: 18, color: Colors.muted },
  rules:      { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: 10, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.md },
  rulesTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 4 },
  rulesItem:  { fontSize: 13, color: Colors.muted, lineHeight: 20 },
});
