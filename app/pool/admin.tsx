import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { detectLocale, t, Locale } from '../../constants/i18n';
import { subscribePool, updateMatchResult, addKnockoutMatch, removePlayer, syncResultsFromAPI } from '../../services/poolService';
import { calcPoints, flag, Match } from '../../constants/matches';
import { GRUPOS, OCTAVOS, calcTabla } from '../../constants/groups';
import { ref, set } from 'firebase/database';
import { db } from '../../services/firebase';

export default function AdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const locale: Locale = detectLocale();

  const [poolData, setPoolData] = useState<any>(null);
  const [uid, setUid] = useState('');
  const [section, setSection] = useState<'results' | 'bracket' | 'players' | 'add'>('results');
  const [syncing, setSyncing] = useState(false);
  const [adminResult, setAdminResult] = useState<Record<string, { home: string; away: string }>>({});
  const [newMatch, setNewMatch] = useState({ home: '', away: '', phase: 'r32', date: '2026-06-29', time: '20:00' });
  const [bracketSlots, setBracketSlots] = useState<Record<string, string>>({});
  const [bracketDate, setBracketDate] = useState('2026-06-29');
  const [bracketTime, setBracketTime] = useState('20:00');
  const [generating, setGenerating] = useState(false);
  const [matchSchedule, setMatchSchedule] = useState<Record<number, { date: string; time: string }>>({});
  const [qfSchedule, setQfSchedule] = useState<Record<number, { date: string; time: string; home: string; away: string }>>({});
  const [sfSchedule, setSfSchedule] = useState<Record<number, { date: string; time: string; home: string; away: string }>>({});
  const [fnSchedule, setFnSchedule] = useState<Record<number, { date: string; time: string; home: string; away: string }>>({});
  const [fetchingSchedule, setFetchingSchedule] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('uid').then(v => setUid(v ?? ''));
  }, []);

  useEffect(() => {
    if (!id) return;
    return subscribePool(id, data => setPoolData(data));
  }, [id]);

  if (!poolData) return <View style={s.center}><ActivityIndicator color={Colors.gold} /></View>;

  const meta = poolData.meta ?? {};
  const players: Record<string, any> = poolData.players ?? {};
  const matches: Record<string, Match> = poolData.matches ?? {};
  const matchList = Object.values(matches).sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0));
  const groupMatches = matchList.filter(m => m.phase === 'groups');
  const isAdmin = meta.adminUid === uid;

  if (!isAdmin) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>No tienes permisos de admin</Text>
      </View>
    );
  }

  // Calculate group standings from results
  const groupStandings: Record<string, any[]> = {};
  Object.keys(GRUPOS).forEach(g => {
    groupStandings[g] = calcTabla(g, groupMatches);
  });

  // Resolve bracket slot to team name
  function resolveSlot(slot: string): string {
    if (bracketSlots[slot]) return bracketSlots[slot];
    const pos = parseInt(slot[0]);
    const grp = slot[1];
    if (grp && groupStandings[grp] && groupStandings[grp][pos - 1]) {
      return groupStandings[grp][pos - 1].e;
    }
    return '';
  }

  async function handleAdminResult(matchId: string) {
    const r = adminResult[matchId];
    if (r?.home === undefined || r?.home === '' || r?.away === undefined || r?.away === '') {
      Alert.alert('', 'Introduce ambos marcadores');
      return;
    }
    try {
      await updateMatchResult(id!, matchId, r.home, r.away);
      setAdminResult(prev => { const n = { ...prev }; delete n[matchId]; return n; });
      Alert.alert('✓', 'Resultado guardado');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el resultado');
    }
  }

  async function handleSync() {
    setSyncing(true);
    const updated = await syncResultsFromAPI(id!, matchList);
    setSyncing(false);
    if (updated === -1) Alert.alert('Error', t('errorNoAPI', locale));
    else if (updated === 0) Alert.alert('', t('errorNoResults', locale));
    else Alert.alert('✓', `${updated} ${t('syncedResults', locale)}`);
  }

  async function fetchKnockoutSchedule() {
    setFetchingSchedule(true);
    try {
      const res = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026', {
        headers: { 'x-apisports-key': '95ea5f8bce0ce8bdeba48f077d4751e9' },
      });
      const data = await res.json();
      if (data.errors?.requests || data.errors?.rateLimit) {
        Alert.alert('', t('apiLimitReached', locale));
        return;
      }
      const NAME_MAP: Record<string, string> = {"Spain":"España","France":"Francia","Germany":"Alemania","Brazil":"Brasil","Argentina":"Argentina","Portugal":"Portugal","England":"Inglaterra","Netherlands":"Países Bajos","Belgium":"Bélgica","Croatia":"Croacia","Italy":"Italia","Mexico":"México","United States":"EE.UU.","USA":"EE.UU.","Canada":"Canadá","Uruguay":"Uruguay","Colombia":"Colombia","Japan":"Japón","South Korea":"Corea del Sur","Korea Republic":"Corea del Sur","Morocco":"Marruecos","Senegal":"Senegal","South Africa":"Sudáfrica","Czech Republic":"Rep. Checa","Czechia":"Rep. Checa","Switzerland":"Suiza","Australia":"Australia","Paraguay":"Paraguay","Ivory Coast":"C. Marfil","Ecuador":"Ecuador","Sweden":"Suecia","Tunisia":"Túnez","Egypt":"Egipto","Iran":"Irán","New Zealand":"N. Zelanda","Saudi Arabia":"Arabia S.","Iraq":"Irak","Norway":"Noruega","Austria":"Austria","Algeria":"Argelia","DR Congo":"RD Congo","Uzbekistan":"Uzbekistán","Ghana":"Ghana","Panama":"Panamá","Haiti":"Haití","Scotland":"Escocia","Turkey":"Turquía","Jordan":"Jordania","Curacao":"Curazao","Cape Verde":"C. Verde","Qatar":"Qatar","Bosnia and Herzegovina":"Bosnia"};
      const mapN = (n: string) => NAME_MAP[n] || n;
      const fixtures: any[] = data.response ?? [];
      const GROUP_END = Date.UTC(2026, 5, 28);
      const ko = fixtures
        .filter(f => f.fixture?.date && new Date(f.fixture.date).getTime() >= GROUP_END)
        .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());

      const byPhase: Record<string, any[]> = { r32: [], qf: [], sf: [], fn: [] };
      ko.forEach(f => {
        const r = (f.league?.round ?? '').toLowerCase();
        if (r.includes('32') || r.includes('1/16')) byPhase.r32.push(f);
        else if (r.includes('quarter') || r.includes('1/4')) byPhase.qf.push(f);
        else if (r.includes('semi') || r.includes('1/2')) byPhase.sf.push(f);
        else if (r.includes('final') || r.includes('3rd') || r.includes('bron')) byPhase.fn.push(f);
      });
      if (!byPhase.r32.length && !byPhase.qf.length) {
        byPhase.r32 = ko.slice(0, 16); byPhase.qf = ko.slice(16, 24);
        byPhase.sf = ko.slice(24, 28); byPhase.fn = ko.slice(28);
      }

      const toSched = (arr: any[]) => {
        const result: Record<number, any> = {};
        arr.forEach((f, i) => {
          const d = new Date(f.fixture.date);
          result[i] = {
            date: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`,
            time: `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`,
            home: mapN(f.teams?.home?.name ?? ''),
            away: mapN(f.teams?.away?.name ?? ''),
          };
        });
        return result;
      };

      setMatchSchedule(toSched(byPhase.r32));
      setQfSchedule(toSched(byPhase.qf));
      setSfSchedule(toSched(byPhase.sf));
      setFnSchedule(toSched(byPhase.fn));
      const total = byPhase.r32.length + byPhase.qf.length + byPhase.sf.length + byPhase.fn.length;
      Alert.alert('✓', `${total} ${t('schedulesLoaded', locale)}`);
    } catch {
      Alert.alert('Error', t('errorNoAPI', locale));
    } finally {
      setFetchingSchedule(false);
    }
  }

  async function generateR32() {
    const missing = OCTAVOS.filter(([a, b]) => !resolveSlot(a) || !resolveSlot(b));
    if (missing.length > 0) {
      Alert.alert(t('missingTeams', locale), t('missingTeamsMsg', locale).replace('{n}', String(missing.length)));
      return;
    }
    setGenerating(true);
    const [y, m, d] = bracketDate.split('-').map(Number);
    const [h, min] = bracketTime.split(':').map(Number);
    const defaultKickoff = Date.UTC(y, m - 1, d, h, min);
    for (let i = 0; i < OCTAVOS.length; i++) {
      const [slotA, slotB] = OCTAVOS[i];
      const sched = matchSchedule[i];
      let kickoff: number;
      if (sched?.date && sched?.time) {
        const [sy, sm, sd] = sched.date.split('-').map(Number);
        const [sh, smin] = sched.time.split(':').map(Number);
        kickoff = Date.UTC(sy, sm - 1, sd, sh, smin);
      } else {
        kickoff = defaultKickoff + i * 3 * 3600 * 1000;
      }
      await addKnockoutMatch(id!, { home: resolveSlot(slotA), away: resolveSlot(slotB), phase: 'r32', kickoff });
    }
    setGenerating(false);
    Alert.alert('✓', t('r32Created', locale));
    router.back();
  }

  const SECTIONS = [
    { key: 'results', label: t('tabResults', locale) },
    { key: 'bracket', label: t('tabBracket', locale) },
    { key: 'add', label: t('tabAddMatch', locale) },
    { key: 'players', label: t('tabPlayers', locale) },
  ] as const;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>⚙️ Admin</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Section tabs */}
      <View style={s.sectionBar}>
        {SECTIONS.map(sec => (
          <TouchableOpacity
            key={sec.key}
            style={[s.sectionBtn, section === sec.key && s.sectionBtnActive]}
            onPress={() => setSection(sec.key)}
          >
            <Text style={[s.sectionBtnTxt, section === sec.key && s.sectionBtnTxtActive]}>{sec.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── RESULTS ── */}
        {section === 'results' && (
          <>
            <TouchableOpacity style={[s.syncBtn, syncing && { opacity: 0.6 }]} onPress={syncing ? undefined : handleSync} disabled={syncing}>
              {syncing ? <ActivityIndicator color="#fff" /> : <Text style={s.syncTxt}>🔄 {t('syncResults', locale)}</Text>}
            </TouchableOpacity>
            {matchList.filter(m => m.result.home === '').map(m => (
              <View key={m.id} style={s.card}>
                <Text style={s.cardTitle}>{flag(m.home)} {m.home} – {m.away} {flag(m.away)}</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.scoreInput} placeholder="0" placeholderTextColor={Colors.muted}
                    keyboardType="number-pad" maxLength={2}
                    value={adminResult[m.id]?.home ?? ''}
                    onChangeText={v => setAdminResult(p => ({ ...p, [m.id]: { home: v, away: p[m.id]?.away ?? '' } }))}
                  />
                  <Text style={s.dash}>–</Text>
                  <TextInput
                    style={s.scoreInput} placeholder="0" placeholderTextColor={Colors.muted}
                    keyboardType="number-pad" maxLength={2}
                    value={adminResult[m.id]?.away ?? ''}
                    onChangeText={v => setAdminResult(p => ({ ...p, [m.id]: { home: p[m.id]?.home ?? '', away: v } }))}
                  />
                  <TouchableOpacity style={s.saveBtn} onPress={() => handleAdminResult(m.id)}>
                    <Text style={s.saveBtnTxt}>✓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {matchList.filter(m => m.result.home === '').length === 0 && (
              <Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>
                {t('allResultsDone', locale)}
              </Text>
            )}
          </>
        )}

        {/* ── BRACKET OCTAVOS ── */}
        {section === 'bracket' && (
          <>
            {/* API fetch button */}
            <TouchableOpacity
              style={[s.syncBtn, { marginBottom: Spacing.md }, fetchingSchedule && { opacity: 0.6 }]}
              onPress={fetchingSchedule ? undefined : fetchKnockoutSchedule}
              disabled={fetchingSchedule}
            >
              {fetchingSchedule
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.syncTxt}>🗓️ {t('syncResults', locale)}</Text>}
            </TouchableOpacity>

            <Text style={s.sectionLabel}>
              {t('defaultDateTimeLabel', locale)}
            </Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.scoreInput, { flex: 1, width: undefined }]}
                placeholder="2026-06-29" placeholderTextColor={Colors.muted}
                value={bracketDate} onChangeText={setBracketDate}
              />
              <TextInput
                style={[s.scoreInput, { width: 80 }]}
                placeholder="20:00" placeholderTextColor={Colors.muted}
                value={bracketTime} onChangeText={setBracketTime}
              />
            </View>
            <Text style={s.hint}>
              {locale === 'es'
                ? 'Fallback con 3h de diferencia entre partidos'
                : 'Fallback with 3h between matches'}
            </Text>

            <Text style={[s.sectionLabel, { marginTop: Spacing.lg }]}>
              {t('matchupsSchedule', locale)}
            </Text>

            {OCTAVOS.map(([slotA, slotB], i) => {
              const teamA = resolveSlot(slotA);
              const teamB = resolveSlot(slotB);
              const sched = matchSchedule[i];
              return (
                <View key={i} style={s.card}>
                  <Text style={s.slotLabel}>{slotA} vs {slotB}</Text>
                  <View style={s.bracketRow}>
                    <View style={s.bracketTeamBox}>
                      {teamA
                        ? <Text style={s.bracketTeamName}>{flag(teamA)} {teamA}</Text>
                        : <TextInput
                            style={s.bracketInput}
                            placeholder={slotA}
                            placeholderTextColor={Colors.muted}
                            value={bracketSlots[slotA] ?? ''}
                            onChangeText={v => setBracketSlots(p => ({ ...p, [slotA]: v }))}
                          />
                      }
                    </View>
                    <Text style={s.vs}>vs</Text>
                    <View style={s.bracketTeamBox}>
                      {teamB
                        ? <Text style={s.bracketTeamName}>{flag(teamB)} {teamB}</Text>
                        : <TextInput
                            style={s.bracketInput}
                            placeholder={slotB}
                            placeholderTextColor={Colors.muted}
                            value={bracketSlots[slotB] ?? ''}
                            onChangeText={v => setBracketSlots(p => ({ ...p, [slotB]: v }))}
                          />
                      }
                    </View>
                  </View>
                  {/* Per-match date/time */}
                  <View style={[s.inputRow, { marginTop: 8 }]}>
                    <Text style={{ fontSize: 12, color: Colors.muted }}>📅</Text>
                    <TextInput
                      style={[s.bracketInput, { flex: 1 }]}
                      placeholder="2026-06-29"
                      placeholderTextColor={Colors.muted}
                      value={sched?.date ?? ''}
                      onChangeText={v => setMatchSchedule(p => ({ ...p, [i]: { ...(p[i] ?? { date: '', time: '' }), date: v } }))}
                    />
                    <TextInput
                      style={[s.bracketInput, { width: 72 }]}
                      placeholder="20:00"
                      placeholderTextColor={Colors.muted}
                      value={sched?.time ?? ''}
                      onChangeText={v => setMatchSchedule(p => ({ ...p, [i]: { ...(p[i] ?? { date: '', time: '' }), time: v } }))}
                    />
                  </View>
                  {sched?.date && (
                    <Text style={{ fontSize: 11, color: Colors.gold, marginTop: 4 }}>
                      ✓ {sched.date} {sched.time}
                    </Text>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={[s.generateBtn, generating && { opacity: 0.6 }]}
              onPress={generateR32}
              disabled={generating}
            >
              {generating
                ? <ActivityIndicator color={Colors.bg} />
                : <Text style={s.generateBtnTxt}>
                    {t('createR32Btn', locale)}
                  </Text>
              }
            </TouchableOpacity>

            {/* ── Cuartos, Semis, Final ── */}
            {([
              { label: t('qf', locale), phase: 'qf', sched: qfSchedule, setSched: setQfSchedule, n: 8 },
              { label: t('sf', locale), phase: 'sf', sched: sfSchedule, setSched: setSfSchedule, n: 4 },
              { label: `${t('final', locale)} & ${t('bronze', locale)}`, phase: 'final', sched: fnSchedule, setSched: setFnSchedule, n: 2 },
            ] as const).map(({ label, phase, sched, setSched, n }) => (
              <View key={phase} style={{ marginTop: Spacing.lg }}>
                <Text style={[s.sectionLabel, { marginBottom: Spacing.sm }]}>{label}</Text>
                {Array.from({ length: Math.max(n, Object.keys(sched).length) }).map((_, i) => {
                  const t = (sched as any)[i] ?? {};
                  return (
                    <View key={i} style={[s.card, { marginBottom: Spacing.sm }]}>
                      <View style={s.inputRow}>
                        <TextInput
                          style={[s.bracketInput, { flex: 1 }]}
                          placeholder={t('homeTeam', locale)}
                          placeholderTextColor={Colors.muted}
                          value={t.home ?? ''}
                          onChangeText={v => setSched((p: any) => ({ ...p, [i]: { ...(p[i] ?? {}), home: v } }))}
                        />
                        <Text style={s.vs}>vs</Text>
                        <TextInput
                          style={[s.bracketInput, { flex: 1 }]}
                          placeholder={t('awayTeam', locale)}
                          placeholderTextColor={Colors.muted}
                          value={t.away ?? ''}
                          onChangeText={v => setSched((p: any) => ({ ...p, [i]: { ...(p[i] ?? {}), away: v } }))}
                        />
                      </View>
                      <View style={[s.inputRow, { marginTop: 8 }]}>
                        <Text style={{ fontSize: 12, color: Colors.muted }}>📅</Text>
                        <TextInput
                          style={[s.bracketInput, { flex: 1 }]}
                          placeholder="2026-07-04"
                          placeholderTextColor={Colors.muted}
                          value={t.date ?? ''}
                          onChangeText={v => setSched((p: any) => ({ ...p, [i]: { ...(p[i] ?? {}), date: v } }))}
                        />
                        <TextInput
                          style={[s.bracketInput, { width: 72 }]}
                          placeholder="21:00"
                          placeholderTextColor={Colors.muted}
                          value={t.time ?? ''}
                          onChangeText={v => setSched((p: any) => ({ ...p, [i]: { ...(p[i] ?? {}), time: v } }))}
                        />
                      </View>
                      {t.date && <Text style={{ fontSize: 11, color: Colors.gold, marginTop: 4 }}>✓ {t.date} {t.time}</Text>}
                    </View>
                  );
                })}
                <TouchableOpacity
                  style={s.generateBtn}
                  onPress={async () => {
                    const toCreate = Object.entries(sched as any)
                      .filter(([, t]: any) => t.home && t.away)
                      .filter(([, t]: any) => !matchList.find(m => m.phase === phase && m.home === (t as any).home && m.away === (t as any).away));
                    if (!toCreate.length) { Alert.alert('', t('noNewMatches', locale)); return; }
                    for (const [, t] of toCreate) {
                      const tt = t as any;
                      let kickoff = 0;
                      if (tt.date && tt.time) {
                        const [y, m, d] = tt.date.split('-').map(Number);
                        const [h, min] = tt.time.split(':').map(Number);
                        kickoff = Date.UTC(y, m - 1, d, h, min);
                      }
                      await addKnockoutMatch(id!, { home: tt.home, away: tt.away, phase, kickoff });
                    }
                    Alert.alert('✓', `${toCreate.length} ${t('matchesCreated', locale)}`);
                  }}
                >
                  <Text style={s.generateBtnTxt}>🗓️ {locale === 'es' ? `Crear partidos de ${label}` : `Create ${label} matches`}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* ── ADD MATCH ── */}
        {section === 'add' && (
          <>
            <Text style={s.sectionLabel}>{locale === 'es' ? 'Añadir partido' : 'Add match'}</Text>
            <View style={s.card}>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.scoreInput, { flex: 1, width: undefined }]}
                  placeholder={locale === 'es' ? 'Equipo local' : 'Home team'}
                  placeholderTextColor={Colors.muted}
                  value={newMatch.home}
                  onChangeText={v => setNewMatch(p => ({ ...p, home: v }))}
                />
                <Text style={s.dash}>vs</Text>
                <TextInput
                  style={[s.scoreInput, { flex: 1, width: undefined }]}
                  placeholder={locale === 'es' ? 'Visitante' : 'Away team'}
                  placeholderTextColor={Colors.muted}
                  value={newMatch.away}
                  onChangeText={v => setNewMatch(p => ({ ...p, away: v }))}
                />
              </View>

              <View style={[s.inputRow, { marginTop: 8, flexWrap: 'wrap' }]}>
                {(['r32','qf','sf','final'] as const).map(ph => (
                  <TouchableOpacity
                    key={ph}
                    style={[s.phaseBtn, newMatch.phase === ph && s.phaseBtnActive]}
                    onPress={() => setNewMatch(p => ({ ...p, phase: ph }))}
                  >
                    <Text style={[s.phaseBtnTxt, newMatch.phase === ph && s.phaseBtnTxtActive]}>
                      {t(ph, locale)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[s.inputRow, { marginTop: 8 }]}>
                <TextInput
                  style={[s.scoreInput, { flex: 1, width: undefined }]}
                  placeholder="2026-06-29" placeholderTextColor={Colors.muted}
                  value={newMatch.date}
                  onChangeText={v => setNewMatch(p => ({ ...p, date: v }))}
                />
                <TextInput
                  style={[s.scoreInput, { width: 80 }]}
                  placeholder="20:00" placeholderTextColor={Colors.muted}
                  value={newMatch.time}
                  onChangeText={v => setNewMatch(p => ({ ...p, time: v }))}
                />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, { flex: 0, marginTop: 8, paddingHorizontal: 20 }]}
                onPress={async () => {
                  if (!newMatch.home.trim() || !newMatch.away.trim()) { Alert.alert('', t('fillAll', locale)); return; }
                  const [y, m, d] = newMatch.date.split('-').map(Number);
                  const [h, min] = newMatch.time.split(':').map(Number);
                  await addKnockoutMatch(id!, {
                    home: newMatch.home.trim(), away: newMatch.away.trim(),
                    phase: newMatch.phase, kickoff: Date.UTC(y, m - 1, d, h, min),
                  });
                  setNewMatch({ home: '', away: '', phase: 'r32', date: '2026-06-29', time: '20:00' });
                  Alert.alert('✓', locale === 'es' ? 'Partido añadido' : 'Match added');
                }}
              >
                <Text style={s.saveBtnTxt}>{locale === 'es' ? '+ Añadir' : '+ Add'}</Text>
              </TouchableOpacity>
            </View>

            {/* List existing knockout matches */}
            <Text style={[s.sectionLabel, { marginTop: Spacing.lg }]}>
              {locale === 'es' ? 'Partidos de eliminatorias' : 'Knockout matches'}
            </Text>
            {matchList.filter(m => m.phase !== 'groups').length === 0 && (
              <Text style={[s.muted, { textAlign: 'center', marginTop: 20 }]}>
                {locale === 'es' ? 'Sin partidos de eliminatorias aún' : 'No knockout matches yet'}
              </Text>
            )}
            {matchList.filter(m => m.phase !== 'groups').map(m => (
              <View key={m.id} style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{flag(m.home)} {m.home} vs {m.away} {flag(m.away)}</Text>
                  <Text style={s.muted}>{t(m.phase, locale)} · {m.result.home !== '' ? `${m.result.home}–${m.result.away}` : (locale === 'es' ? 'Pendiente' : 'Pending')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert(
                    locale === 'es' ? 'Eliminar partido' : 'Delete match',
                    `${m.home} vs ${m.away}`,
                    [
                      { text: t('cancel', locale), style: 'cancel' },
                      { text: locale === 'es' ? 'Eliminar' : 'Delete', style: 'destructive',
                        onPress: async () => { await set(ref(db, `pools/${id}/matches/${m.id}`), null); }
                      },
                    ]
                  )}
                  style={s.deleteBtn}
                >
                  <Text style={s.deleteBtnTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* ── PLAYERS ── */}
        {section === 'players' && (
          <>
            <Text style={s.sectionLabel}>
              {Object.keys(players).length} {t('players', locale)}
            </Text>
            {Object.values(players).map((p: any) => (
              <View key={p.uid} style={s.card}>
                <View style={s.playerRow}>
                  <Text style={s.playerAvatar}>{p.avatar}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.playerName}>{p.name}</Text>
                    {p.uid === meta.adminUid && (
                      <Text style={s.adminBadge}>Admin</Text>
                    )}
                  </View>
                  {p.uid !== meta.adminUid && (
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        locale === 'es' ? 'Eliminar jugador' : 'Remove player',
                        p.name,
                        [
                          { text: t('cancel', locale), style: 'cancel' },
                          { text: locale === 'es' ? 'Eliminar' : 'Remove', style: 'destructive',
                            onPress: () => removePlayer(id!, p.uid)
                          },
                        ]
                      )}
                      style={s.deleteBtn}
                    >
                      <Text style={s.deleteBtnTxt}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted:       { fontSize: 13, color: Colors.muted },
  header:      { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:     { padding: 8, width: 40 },
  backTxt:     { fontSize: 22, color: Colors.ink },
  title:       { flex: 1, fontSize: 18, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  sectionBar:  { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row' },
  sectionBarContent: { flexDirection: 'row', gap: 0, flex: 1 },
  sectionBtn:  { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  sectionBtnActive: { borderBottomColor: Colors.gold },
  sectionBtnTxt: { fontSize: 12, fontWeight: '600', color: Colors.muted, textAlign: 'center' },
  sectionBtnTxtActive: { color: Colors.gold },
  scroll:      { flex: 1, padding: Spacing.md },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  hint:        { fontSize: 11, color: Colors.muted, marginTop: 4, marginBottom: Spacing.md },
  card:        { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  cardTitle:   { fontSize: 14, fontWeight: '600', color: Colors.ink, marginBottom: 8 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreInput:  { width: 56, height: 46, textAlign: 'center', fontSize: 18, fontWeight: '800', borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.cardAlt, color: Colors.ink },
  dash:        { fontSize: 18, fontWeight: '800', color: Colors.muted },
  vs:          { fontSize: 13, fontWeight: '700', color: Colors.muted, width: 24, textAlign: 'center' },
  saveBtn:     { flex: 1, backgroundColor: Colors.green, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  saveBtnTxt:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  syncBtn:     { backgroundColor: Colors.blue, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md },
  syncTxt:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  slotLabel:   { fontSize: 11, fontWeight: '700', color: Colors.gold, marginBottom: 8, textTransform: 'uppercase' },
  bracketRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bracketTeamBox: { flex: 1 },
  bracketTeamName: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  bracketInput:{ height: 38, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardAlt, color: Colors.ink, paddingHorizontal: 8, fontSize: 13 },
  generateBtn: { backgroundColor: Colors.gold, borderRadius: Radius.xl, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
  generateBtnTxt: { fontSize: 16, fontWeight: '800', color: Colors.bg },
  phaseBtn:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardAlt },
  phaseBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + '20' },
  phaseBtnTxt: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  phaseBtnTxtActive: { color: Colors.gold },
  playerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerAvatar:{ fontSize: 24 },
  playerName:  { fontSize: 14, fontWeight: '700', color: Colors.ink },
  adminBadge:  { fontSize: 10, color: Colors.gold, fontWeight: '700', marginTop: 2 },
  deleteBtn:   { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.danger + '30', alignItems: 'center', justifyContent: 'center' },
  deleteBtnTxt:{ fontSize: 13, fontWeight: '700', color: Colors.danger },
});
