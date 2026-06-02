import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Radius, Spacing } from '../constants/theme';
import { detectLocale, t, Locale } from '../constants/i18n';
import { createPool } from '../services/poolService';
import { AVATARS } from '../constants/matches';
import { generateUid } from '../services/firebase';

export default function CreateScreen() {
  const router = useRouter();
  const locale: Locale = detectLocale();
  const [poolName, setPoolName] = useState('');
  const [myName, setMyName] = useState('');
  const [avatar, setAvatar] = useState('⚽');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!poolName.trim() || !myName.trim()) {
      Alert.alert('', t('fillAll', locale));
      return;
    }
    setLoading(true);
    try {
      let uid = await AsyncStorage.getItem('uid');
      if (!uid) {
        uid = generateUid();
        await AsyncStorage.setItem('uid', uid);
      }
      const poolId = await createPool(uid, myName.trim(), avatar, poolName.trim(), locale);
      const pools = JSON.parse((await AsyncStorage.getItem('my_pools')) ?? '[]');
      pools.unshift({ id: poolId, name: poolName.trim() });
      await AsyncStorage.setItem('my_pools', JSON.stringify(pools));
      await AsyncStorage.setItem('my_name', myName.trim());
      await AsyncStorage.setItem('my_avatar', avatar);
      router.replace(`/pool/${poolId}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? e?.code ?? JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>🏆 {t('createPool', locale)}</Text>

      <Text style={s.label}>{t('poolName', locale)}</Text>
      <TextInput
        style={s.input}
        value={poolName}
        onChangeText={setPoolName}
        placeholder={locale === 'es' ? 'Ej: La Porra de los amigos' : 'E.g. World Cup Friends'}
        placeholderTextColor={Colors.muted}
        maxLength={40}
      />

      <Text style={s.label}>{t('yourName', locale)}</Text>
      <TextInput
        style={s.input}
        value={myName}
        onChangeText={setMyName}
        placeholder={locale === 'es' ? 'Tu nombre' : 'Your name'}
        placeholderTextColor={Colors.muted}
        maxLength={20}
      />

      <Text style={s.label}>{t('avatar', locale)}</Text>
      <View style={s.avatarGrid}>
        {AVATARS.slice(0, 20).map(a => (
          <TouchableOpacity
            key={a}
            style={[s.avatarBtn, avatar === a && s.avatarSelected]}
            onPress={() => setAvatar(a)}
          >
            <Text style={s.avatarEmoji}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleCreate} disabled={loading}>
        {loading
          ? <ActivityIndicator color={Colors.bg} />
          : <Text style={s.btnText}>{t('create', locale)} →</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  scroll:      { padding: Spacing.lg, paddingTop: Spacing.xl, gap: Spacing.md, paddingBottom: 60 },
  title:       { fontSize: 26, fontWeight: '900', color: Colors.ink, marginBottom: Spacing.sm },
  label:       { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:       { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, fontSize: 16, color: Colors.ink, borderWidth: 1, borderColor: Colors.border },
  avatarGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatarBtn:   { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarSelected: { borderColor: Colors.gold, borderWidth: 2, backgroundColor: Colors.cardAlt },
  avatarEmoji: { fontSize: 24 },
  btn:         { backgroundColor: Colors.gold, borderRadius: Radius.xl, paddingVertical: 18, alignItems: 'center', marginTop: Spacing.md },
  btnDisabled: { opacity: 0.6 },
  btnText:     { fontSize: 17, fontWeight: '800', color: Colors.bg },
});
