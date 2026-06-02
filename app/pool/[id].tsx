import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Share, Alert, TextInput, ActivityIndicator, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { detectLocale, t, Locale } from '../../constants/i18n';
import { formatMatchTime, getDeviceTimezone, formatDateGroup, dayKey, todayKey, tomorrowKey } from '../../constants/datetime';
import {
  subscribePool, savePrediction, savePredictionSide, saveChampion, saveReaction,
  updateMatchResult, syncResultsFromAPI, removePlayer, addKnockoutMatch,
} from '../../services/poolService';
import { calcPoints, isLocked, flag, Match, PHASE_PTS, FLAGS } from '../../constants/matches';
import { GRUPOS, REACTIONS, calcTabla } from '../../constants/groups';

type Tab = 'predict' | 'ranking' | 'grupos' | 'bracket' | 'admin' | 'invite';
type TabDef = { key: Tab; icon: string; isLink?: boolean };

const LOCK_MS = 5 * 60 * 1000;
const KO_TS = Date.UTC(2026, 5, 11, 19, 0);

export default function PoolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const locale: Locale = detectLocale();

  const [poolData, setPoolData] = useState<any>(null);
  const [uid, setUid] = useState('');
  const [tab, setTab] = useState<Tab>('predict');
  const [now, setNow] = useState(Date.now());
  const [showChampion, setShowChampion] = useState(false);
  const [openPreds, setOpenPreds] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [adminResult, setAdminResult] = useState<Record<string, { home: string; away: string }>>({});
  const [newMatch, setNewMatch] = useState({ home: '', away: '', phase: 'r32', date: '', time: '' });
  const [addingMatch, setAddingMatch] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('uid').then(v => setUid(v ?? ''));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    return subscribePool(id, data => setPoolData(data));
  }, [id]);

  if (!poolData) {
    return <View style={s.center}><ActivityIndicator color={Colors.gold} /></View>;
  }

  const meta = poolData.meta ?? {};
  const players: Record<string, any> = poolData.players ?? {};
  const matches: Record<string, Match> = poolData.matches ?? {};
  const predictions: Record<string, Record<string, { home: string; away: string }>> = poolData.predictions ?? {};
  const champion: Record<string, string> = poolData.champion ?? {};
  const reactions: Record<string, Record<string, number>> = poolData.reactions ?? {};
  const isAdmin = meta.adminUid === uid;
  const matchList = Object.values(matches).sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0));
  const groupMatches = matchList.filter(m => m.phase === 'groups');

  const standings = Object.values(players).map((p: any) => {
    const total = matchList.reduce((sum, m) => {
      if (m.result.home === '') return sum;
      return sum + calcPoints(predictions[p.uid]?.[m.id], m.result, m.phase);
    }, 0);
    const exact = matchList.reduce((sum, m) => {
      if (m.result.home === '') return sum;
      const pts = calcPoints(predictions[p.uid]?.[m.id], m.result, m.phase);
      return sum + (pts === PHASE_PTS[m.phase].exact ? 1 : 0);
    }, 0);
    return { ...p, total, exact };
  }).sort((a: any, b: any) => b.total - a.total || b.exact - a.exact);

  function handlePred(matchId: string, side: 'home' | 'away', val: string) {
    if (!uid || !id) return;
    savePredictionSide(id, uid, matchId, side, val);
  }

  function goRandom() {
    if (!uid || !id) return;
    const pending = matchList.filter(m => !isLocked(m, now) && m.result.home === '' && (!predictions[uid]?.[m.id] || predictions[uid]?.[m.id]?.home === ''));
    pending.forEach(m => {
      savePrediction(id, uid, m.id, String(Math.floor(Math.random() * 4)), String(Math.floor(Math.random() * 4)));
    });
    if (pending.length === 0) Alert.alert('', t('noPending', locale));
  }

  function handleReaction(matchId: string, emoji: string) {
    if (!id) return;
    const cur = (reactions[matchId] ?? {})[emoji] ?? 0;
    saveReaction(id, matchId, emoji, cur + 1);
  }

  async function handleSync() {
    setSyncing(true);
    const updated = await syncResultsFromAPI(id!, matchList);
    setSyncing(false);
    if (updated === -1) Alert.alert('Error', t('errorNoAPI', locale));
    else if (updated === 0) Alert.alert('', t('errorNoResults', locale));
    else Alert.alert('✓', `${updated} ${t('syncedResults', locale)}`);
  }

  async function handleAdminResult(matchId: string) {
    const r = adminResult[matchId];
    if (!r?.home || !r?.away) return;
    await updateMatchResult(id!, matchId, r.home, r.away);
    setAdminResult(prev => { const n = { ...prev }; delete n[matchId]; return n; });
  }

  async function handleShare() {
    await Share.share({ message: `${t('shareText', locale)}${meta.inviteCode}`, title: 'MatchPool' });
  }

  // Countdown
  const remaining = Math.max(0, KO_TS - now);
  const cd = {
    d: Math.floor(remaining / 86400000),
    h: Math.floor((remaining % 86400000) / 3600000),
    m: Math.floor((remaining % 3600000) / 60000),
    s: Math.floor((remaining % 60000) / 1000),
  };

  const TABS: TabDef[] = [
    { key: 'predict', icon: '⚽' },
    { key: 'ranking', icon: '🏆' },
    { key: 'grupos', icon: '🏟️' },
    { key: 'bracket', icon: '🗓️' },
    { key: 'invite', icon: '👥' },
    ...(isAdmin ? [{ key: 'admin' as Tab, icon: '⚙️', isLink: true }] : []),
  ];

  return (
    <View style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.poolTitle} numberOfLines={1}>{meta.name}</Text>
        <TouchableOpacity onPress={handleShare} style={s.shareBtn}>
          <Text style={s.shareTxt}>🔗</Text>
        </TouchableOpacity>
      </View>

      {/* COUNTDOWN + TIMEZONE */}
      <View style={s.countdown}>
        {now < KO_TS ? (
          <>
            <Text style={s.cdLabel}>⚽ {t('startsIn', locale)}</Text>
            <Text style={s.cdValue}>
              {cd.d > 0 ? `${cd.d}d ` : ''}{String(cd.h).padStart(2, '0')}:{String(cd.m).padStart(2, '0')}:{String(cd.s).padStart(2, '0')}
            </Text>
          </>
        ) : (
          <Text style={s.cdLabel}>⚽ Mundial 2026</Text>
        )}
        <Text style={s.tzLabel}>🕐 {getDeviceTimezone().replace('_', ' ')}</Text>
      </View>

      {/* TABS */}
      <View style={s.tabs}>
        {TABS.map(tb => (
          <TouchableOpacity
            key={tb.key}
            style={[s.tab, tab === tb.key && s.tabActive]}
            onPress={() => tb.isLink ? router.push(`/pool/admin?id=${id}`) : setTab(tb.key)}
          >
            <Text style={[s.tabTxt, tab === tb.key && s.tabTxtActive]}>{tb.icon}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── PREDICT ── */}
      {tab === 'predict' && (
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Champion banner */}
          <TouchableOpacity style={[s.championBanner, champion[uid] && s.championBannerDone]} onPress={() => setShowChampion(true)}>
            <Text style={{ fontSize: 30 }}>{champion[uid] ? flag(champion[uid]) : '🏆'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.championTitle}>{champion[uid] || t('champion', locale)}</Text>
              <Text style={s.championSub}>{champion[uid] ? t('championChange', locale) : t('championPredict', locale)}</Text>
            </View>
            <Text style={{ color: Colors.gold, fontWeight: '700' }}>→</Text>
          </TouchableOpacity>

          {/* Random button */}
          <TouchableOpacity style={s.randomBtn} onPress={goRandom}>
            <Text style={s.randomTxt}>🎲 {t('randomBtn', locale)}</Text>
          </TouchableOpacity>

          {(() => {
            // Group matches by day
            const today = todayKey();
            const tomorrow = tomorrowKey();
            const groups: { key: string; label: string; items: Match[] }[] = [];
            const gIdx: Record<string, number> = {};
            matchList.forEach(m => {
              const k = m.kickoff ? dayKey(m.kickoff) : 'x';
              if (gIdx[k] === undefined) {
                gIdx[k] = groups.length;
                const isToday = k === today;
                const isTomorrow = k === tomorrow;
                const label = isToday
                  ? t('today', locale).toUpperCase()
                  : isTomorrow
                    ? t('tomorrow', locale).toUpperCase()
                    : formatDateGroup(m.kickoff, locale);
                groups.push({ key: k, label, items: [] });
              }
              groups[gIdx[k]].items.push(m);
            });

            return groups.map(group => {
              const isToday = group.key === today;
              const isTomorrow = group.key === tomorrow;
              const defaultOpen = isToday || isTomorrow || (!groups.some(g => g.key === today || g.key === tomorrow) && groups.indexOf(group) === 0);
              const isOpen = openPreds[`day_${group.key}`] !== undefined ? openPreds[`day_${group.key}`] : defaultOpen;
              const pending = group.items.filter(m => !isLocked(m, now) && m.result.home === '' && (!predictions[uid]?.[m.id] || predictions[uid]?.[m.id]?.home === '')).length;

              return (
                <View key={group.key} style={{ marginBottom: Spacing.sm }}>
                  {/* Day header */}
                  <TouchableOpacity
                    style={[s.dayHeader, isToday && s.dayHeaderToday]}
                    onPress={() => setOpenPreds(p => ({ ...p, [`day_${group.key}`]: !isOpen }))}
                  >
                    <Text style={[s.dayHeaderTxt, isToday && s.dayHeaderTxtToday]}>
                      {isOpen ? '▼' : '▶'} {group.label}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {pending > 0 && (
                        <View style={s.pendingBadge}>
                          <Text style={s.pendingBadgeTxt}>{pending} {t('pendingText', locale)}</Text>
                        </View>
                      )}
                      <Text style={s.dayCount}>{group.items.length}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Matches */}
                  {isOpen && group.items.map(m => {
                    const locked = isLocked(m, now);
                    const hasRes = m.result.home !== '';
                    const mine = predictions[uid]?.[m.id] ?? { home: '', away: '' };
                    const pts = hasRes ? calcPoints(mine, m.result, m.phase) : 0;
                    const isExact = hasRes && pts === PHASE_PTS[m.phase].exact;
                    const timeStr = formatMatchTime(m.kickoff, locale);
                    const predCount = Object.values(players).filter((p: any) => predictions[p.uid]?.[m.id]?.home !== undefined && predictions[p.uid]?.[m.id]?.home !== '').length;
                    const minsLeft = m.kickoff ? Math.floor((m.kickoff - LOCK_MS - now) / 60000) : null;
                    const soon = !locked && minsLeft !== null && minsLeft < 60 && minsLeft >= 0;

                    return (
                      <View key={m.id} style={s.matchCard}>
                        <View style={s.matchMeta}>
                          <Text style={s.matchTime}>{timeStr}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            {soon && <Text style={s.soonBadge}>{t('closesIn', locale)} {minsLeft}min</Text>}
                            {locked && !hasRes && <Text style={s.lockedBadge}>🔒</Text>}
                            {hasRes && <Text style={[s.ptsBadge, isExact && s.ptsBadgeExact]}>{isExact ? t('exact', locale) + ' ' : ''}{pts > 0 ? `+${pts}` : '+0'}</Text>}
                          </View>
                        </View>
                        <View style={s.matchRow}>
                          <View style={s.teamLeft}>
                            <Text style={s.teamFlag}>{flag(m.home)}</Text>
                            <Text style={s.teamName} numberOfLines={1}>{m.home}</Text>
                          </View>
                          <View style={s.scoreRow}>
                            <ScoreInput value={mine.home} onSave={v => handlePred(m.id, 'home', v)} disabled={locked || hasRes} />
                            <Text style={s.vs}>:</Text>
                            <ScoreInput value={mine.away} onSave={v => handlePred(m.id, 'away', v)} disabled={locked || hasRes} />
                          </View>
                          <View style={s.teamRight}>
                            <Text style={s.teamFlag}>{flag(m.away)}</Text>
                            <Text style={s.teamName} numberOfLines={1}>{m.away}</Text>
                          </View>
                        </View>
                        {hasRes && <Text style={s.resultTxt}>{t('result', locale)}: {m.result.home} – {m.result.away}</Text>}
                        {locked && (
                          <View style={s.reactionsRow}>
                            {REACTIONS.map(emoji => {
                              const count = (reactions[m.id] ?? {})[emoji] ?? 0;
                              return (
                                <TouchableOpacity key={emoji} style={[s.reactionBtn, count > 0 && s.reactionBtnActive]} onPress={() => handleReaction(m.id, emoji)}>
                                  <Text style={s.reactionEmoji}>{emoji}</Text>
                                  {count > 0 && <Text style={s.reactionCount}>{count}</Text>}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                        {locked && (
                          <TouchableOpacity style={s.showPredsBtn} onPress={() => setOpenPreds(p => ({ ...p, [m.id]: !p[m.id] }))}>
                            <Text style={s.showPredsTxt}>{openPreds[m.id] ? `▲ ${t('hidePreds', locale)}` : `▼ ${t('showPreds', locale)} (${predCount})`}</Text>
                          </TouchableOpacity>
                        )}
                        {locked && openPreds[m.id] && (
                          <View style={s.predsList}>
                            {Object.values(players).map((p: any) => {
                              const pr = predictions[p.uid]?.[m.id];
                              const hasPr = pr?.home !== '' && pr?.home !== undefined;
                              const ppts = hasPr ? calcPoints(pr, m.result, m.phase) : 0;
                              const pExact = ppts === PHASE_PTS[m.phase].exact;
                              return (
                                <View key={p.uid} style={[s.predRow, ppts > 0 && (pExact ? s.predRowExact : s.predRowHit)]}>
                                  <Text style={s.predAvatar}>{p.avatar}</Text>
                                  <Text style={s.predName}>{p.name}{p.uid === uid ? ' (tú)' : ''}</Text>
                                  {hasPr ? <Text style={[s.predScore, pExact && { color: Colors.gold }]}>{pr.home} – {pr.away}</Text>
                                          : <Text style={s.predNone}>{t('noPrediction', locale)}</Text>}
                                  {ppts > 0 && <Text style={[s.predPts, pExact && s.predPtsExact]}>+{ppts}</Text>}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            });
          })()}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── RANKING ── */}
      {tab === 'ranking' && (
        <ScrollView style={s.scroll}>
          <Text style={s.sectionLabel}>{Object.keys(players).length} {t('players', locale)}</Text>
          {standings.map((p: any, i: number) => (
            <View key={p.uid} style={[s.rankRow, p.uid === uid && s.rankRowMe]}>
              <Text style={s.rankPos}>{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</Text>
              <Text style={s.rankAvatar}>{p.avatar}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rankName}>{p.name}{p.uid === uid ? ' (tú)' : ''}</Text>
                <Text style={s.rankSub}>{p.exact} {t('exactCount', locale)}</Text>
              </View>
              <Text style={s.rankPts}>{p.total} {t('points', locale)}</Text>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── GRUPOS ── */}
      {tab === 'grupos' && (
        <ScrollView style={s.scroll}>
          {Object.keys(GRUPOS).map(g => {
            const tabla = calcTabla(g, groupMatches);
            return (
              <View key={g} style={s.groupCard}>
                <Text style={s.groupTitle}>Grupo {g}</Text>
                <View style={s.groupHeader}>
                  <Text style={[s.groupCol, { flex: 1 }]}>Equipo</Text>
                  {['PJ','G','Em','P','GF','GC','Pts'].map(h => (
                    <Text key={h} style={s.groupCol}>{h}</Text>
                  ))}
                </View>
                {tabla.map((row: any, i: number) => (
                  <View key={row.e} style={[s.groupRow, i < 2 && s.groupRowTop, i === tabla.length - 1 && s.groupRowLast]}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {i < 2 && <View style={s.dotGreen} />}
                      <Text style={s.groupTeam} numberOfLines={1}>{flag(row.e)} {row.e}</Text>
                    </View>
                    {[row.pj, row.g, row.em, row.p, row.gf, row.gc, row.pts].map((v: number, idx: number) => (
                      <Text key={idx} style={[s.groupCol, idx === 6 && s.groupPts]}>{v}</Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── BRACKET ── */}
      {tab === 'bracket' && (
        <ScrollView style={s.scroll} contentContainerStyle={{ flexGrow: 1 }}>
          {matchList.filter(m => m.phase !== 'groups').length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>🗓️</Text>
              <Text style={s.emptyTitle}>{t('knockoutStage', locale)}</Text>
              <Text style={s.emptyText}>{t('bracketEmptyText', locale)}</Text>
            </View>
          )}
          {['r32', 'qf', 'sf', 'final'].map(phase => {
            const phaseMatches = matchList.filter(m => m.phase === phase);
            if (phaseMatches.length === 0) return null;
            const labels: Record<string, string> = { r32: t('r32', locale), qf: t('qf', locale), sf: t('sf', locale), final: t('final', locale) };
            return (
              <View key={phase}>
                <Text style={s.bracketPhase}>{labels[phase]}</Text>
                {phaseMatches.map(m => {
                  const hasRes = m.result.home !== '';
                  const mine = predictions[uid]?.[m.id];
                  const pts = mine && hasRes ? calcPoints(mine, m.result, m.phase) : 0;
                  return (
                    <View key={m.id} style={s.bracketCard}>
                      <View style={s.bracketRow}>
                        <Text style={s.bracketFlag}>{flag(m.home)}</Text>
                        <Text style={[s.bracketTeam, hasRes && +m.result.home > +m.result.away && s.bracketWinner]}>{m.home}</Text>
                        <Text style={s.bracketScore}>{hasRes ? m.result.home : mine?.home || '–'}</Text>
                      </View>
                      <View style={s.bracketRow}>
                        <Text style={s.bracketFlag}>{flag(m.away)}</Text>
                        <Text style={[s.bracketTeam, hasRes && +m.result.away > +m.result.home && s.bracketWinner]}>{m.away}</Text>
                        <Text style={s.bracketScore}>{hasRes ? m.result.away : mine?.away || '–'}</Text>
                      </View>
                      {pts > 0 && <Text style={s.bracketPts}>+{pts} pts</Text>}
                    </View>
                  );
                })}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── INVITE ── */}
      {tab === 'invite' && (
        <View style={s.inviteTab}>
          <Text style={s.inviteLabel}>{t('inviteCodeLabel', locale)}</Text>
          <Text style={s.inviteCode}>{meta.inviteCode}</Text>
          <Text style={s.inviteHint}>{t('inviteHint', locale)}</Text>
          <TouchableOpacity style={s.shareFullBtn} onPress={handleShare}>
            <Text style={s.shareFullTxt}>📤 {t('shareInvite', locale)}</Text>
          </TouchableOpacity>
          <Text style={s.inviteCount}>{Object.keys(players).length} {t('players', locale)}</Text>
          <View style={s.playersList}>
            {Object.values(players).map((p: any) => (
              <View key={p.uid} style={s.playerRow}>
                <Text style={s.playerAvatar}>{p.avatar}</Text>
                <Text style={s.playerName}>{p.name}</Text>
                {p.uid === meta.adminUid && <Text style={s.adminBadge}>{t('admin', locale)}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── ADMIN ── */}
      {tab === 'admin' && isAdmin && (
        <ScrollView style={s.scroll}>
          <TouchableOpacity style={[s.syncBtn, syncing && { opacity: 0.6 }]} onPress={syncing ? undefined : handleSync} disabled={syncing}>
            {syncing ? <ActivityIndicator color="#fff" /> : <Text style={s.syncTxt}>🔄 {t('syncResults', locale)}</Text>}
          </TouchableOpacity>
          <Text style={s.sectionLabel}>{t('manualResults', locale)}</Text>
          {matchList.filter(m => m.result.home === '').map(m => (
            <View key={m.id} style={s.adminCard}>
              <Text style={s.adminMatch}>{flag(m.home)} {m.home} vs {m.away} {flag(m.away)}</Text>
              <View style={s.adminInputRow}>
                <TextInput
                  style={s.adminInput}
                  placeholder="0"
                  placeholderTextColor={Colors.muted}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={adminResult[m.id]?.home ?? ''}
                  onChangeText={v => setAdminResult(p => ({ ...p, [m.id]: { home: v, away: p[m.id]?.away ?? '' } }))}
                />
                <Text style={{ color: Colors.muted, fontWeight: '800' }}>–</Text>
                <TextInput
                  style={s.adminInput}
                  placeholder="0"
                  placeholderTextColor={Colors.muted}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={adminResult[m.id]?.away ?? ''}
                  onChangeText={v => setAdminResult(p => ({ ...p, [m.id]: { home: p[m.id]?.home ?? '', away: v } }))}
                />
                <TouchableOpacity style={s.adminSaveBtn} onPress={() => handleAdminResult(m.id)}>
                  <Text style={s.adminSaveTxt}>✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* ADD KNOCKOUT MATCH */}
          <Text style={[s.sectionLabel, { marginTop: Spacing.lg }]}>
            {t('addKnockoutMatch', locale)}
          </Text>
          <View style={s.adminCard}>
            <View style={s.adminInputRow}>
              <TextInput
                style={[s.adminInput, { flex: 1, width: undefined }]}
                placeholder={t('homeTeam', locale)}
                placeholderTextColor={Colors.muted}
                value={newMatch.home}
                onChangeText={v => setNewMatch(p => ({ ...p, home: v }))}
              />
              <Text style={{ color: Colors.muted, fontWeight: '800' }}>vs</Text>
              <TextInput
                style={[s.adminInput, { flex: 1, width: undefined }]}
                placeholder={t('awayTeam', locale)}
                placeholderTextColor={Colors.muted}
                value={newMatch.away}
                onChangeText={v => setNewMatch(p => ({ ...p, away: v }))}
              />
            </View>
            {/* Phase selector */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
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
            {/* Date + Time */}
            <View style={[s.adminInputRow, { marginTop: 8 }]}>
              <TextInput
                style={[s.adminInput, { flex: 1, width: undefined }]}
                placeholder="2026-06-29"
                placeholderTextColor={Colors.muted}
                value={newMatch.date}
                onChangeText={v => setNewMatch(p => ({ ...p, date: v }))}
              />
              <TextInput
                style={[s.adminInput, { width: 80 }]}
                placeholder="20:00"
                placeholderTextColor={Colors.muted}
                value={newMatch.time}
                onChangeText={v => setNewMatch(p => ({ ...p, time: v }))}
              />
            </View>
            <TouchableOpacity
              style={[s.adminSaveBtn, { marginTop: 8 }, addingMatch && { opacity: 0.6 }]}
              disabled={addingMatch}
              onPress={async () => {
                if (!newMatch.home.trim() || !newMatch.away.trim()) return;
                setAddingMatch(true);
                const [y, m2, d] = (newMatch.date || '2026-06-29').split('-').map(Number);
                const [h, min] = (newMatch.time || '20:00').split(':').map(Number);
                const kickoff = Date.UTC(y, m2 - 1, d, h, min);
                await addKnockoutMatch(id!, {
                  home: newMatch.home.trim(), away: newMatch.away.trim(),
                  phase: newMatch.phase, kickoff,
                });
                setNewMatch({ home: '', away: '', phase: 'r32', date: '', time: '' });
                setAddingMatch(false);
              }}
            >
              <Text style={s.adminSaveTxt}>
                {addingMatch ? '...' : t('addMatch', locale)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* PLAYER MANAGEMENT */}
          <Text style={[s.sectionLabel, { marginTop: Spacing.lg }]}>
            {t('playerMgmt', locale)}
          </Text>
          {Object.values(players).map((p: any) => (
            <View key={p.uid} style={[s.adminCard, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <Text style={{ fontSize: 22 }}>{p.avatar}</Text>
              <Text style={[s.adminMatch, { flex: 1, marginBottom: 0 }]}>{p.name}</Text>
              {p.uid === meta.adminUid
                ? <Text style={{ fontSize: 11, color: Colors.gold }}>Admin</Text>
                : <TouchableOpacity
                    onPress={() => Alert.alert(
                      t('removePlayer', locale),
                      `${p.name}?`,
                      [
                        { text: t('cancel', locale), style: 'cancel' },
                        { text: t('remove', locale), style: 'destructive', onPress: () => removePlayer(id!, p.uid) },
                      ]
                    )}
                    style={s.removeBtn}
                  >
                    <Text style={s.removeBtnTxt}>✕</Text>
                  </TouchableOpacity>
              }
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── MODAL CAMPIÓ ── */}
      <Modal visible={showChampion} animationType="slide" transparent onRequestClose={() => setShowChampion(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>🏆 {t('champion', locale)}</Text>
            <Text style={s.modalSub}>{t('championLocked', locale)}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(FLAGS).map(([team, emoji]) => (
                <TouchableOpacity
                  key={team}
                  style={[s.teamRow, champion[uid] === team && s.teamRowSelected]}
                  onPress={() => { saveChampion(id!, uid, team); setShowChampion(false); }}
                >
                  <Text style={s.teamRowFlag}>{emoji as string}</Text>
                  <Text style={s.teamRowName}>{team}</Text>
                  {champion[uid] === team && <Text style={{ color: Colors.gold }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowChampion(false)}>
              <Text style={s.modalCloseTxt}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ScoreInput({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled: boolean }) {
  const [local, setLocal] = useState(value);
  const ref = useRef(value);
  useEffect(() => { if (!disabled) { setLocal(value); ref.current = value; } }, [value, disabled]);
  return (
    <TextInput
      style={[sc.box, disabled && sc.disabled]}
      value={local}
      onChangeText={v => { setLocal(v); ref.current = v; }}
      onBlur={() => { if (ref.current !== value) onSave(ref.current); }}
      keyboardType="number-pad"
      maxLength={2}
      editable={!disabled}
      selectTextOnFocus
      placeholder="–"
      placeholderTextColor={Colors.muted}
    />
  );
}
const sc = StyleSheet.create({
  box: { width: 46, height: 52, textAlign: 'center', fontSize: 22, fontWeight: '800', borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card, color: Colors.ink },
  disabled: { opacity: 0.45 },
});

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:      { padding: 8 },
  backTxt:      { fontSize: 22, color: Colors.ink },
  poolTitle:    { flex: 1, fontSize: 18, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  shareBtn:     { padding: 8 },
  shareTxt:     { fontSize: 20 },
  countdown:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: Colors.cardAlt, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cdLabel:      { fontSize: 12, color: Colors.gold, fontWeight: '700' },
  cdValue:      { fontSize: 14, color: Colors.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tzLabel:      { fontSize: 10, color: Colors.muted, marginLeft: 'auto' },
  tabs:         { flexDirection: 'row', backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:          { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabTxt:       { fontSize: 18, opacity: 0.4 },
  tabTxtActive: { opacity: 1 },
  scroll:       { flex: 1, padding: Spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },

  // Champion
  championBanner:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1.5, borderColor: Colors.gold + '50' },
  championBannerDone: { borderColor: Colors.gold },
  championTitle:      { fontSize: 14, fontWeight: '700', color: Colors.ink },
  championSub:        { fontSize: 11, color: Colors.muted, marginTop: 2 },

  // Random
  randomBtn:  { backgroundColor: Colors.cardAlt, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center', marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  randomTxt:  { fontSize: 13, fontWeight: '700', color: Colors.muted },

  // Match card
  matchCard:   { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  matchMeta:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  matchTime:   { fontSize: 11, color: Colors.muted },
  soonBadge:   { fontSize: 10, fontWeight: '700', color: Colors.bg, backgroundColor: Colors.gold, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 },
  lockedBadge: { fontSize: 12, color: Colors.danger },
  ptsBadge:    { fontSize: 11, fontWeight: '800', color: Colors.muted, backgroundColor: Colors.cardAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  ptsBadgeExact: { color: Colors.bg, backgroundColor: Colors.gold },
  matchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamLeft:    { flex: 1, alignItems: 'flex-start', gap: 2 },
  teamRight:   { flex: 1, alignItems: 'flex-end', gap: 2 },
  teamFlag:    { fontSize: 28 },
  teamName:    { fontSize: 11, fontWeight: '600', color: Colors.ink },
  scoreRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vs:          { fontSize: 20, fontWeight: '800', color: Colors.muted },
  resultTxt:   { textAlign: 'center', fontSize: 11, color: Colors.muted, marginTop: 8 },

  // Reactions
  reactionsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  reactionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardAlt },
  reactionBtnActive: { borderColor: Colors.green + '80', backgroundColor: Colors.green + '20' },
  reactionEmoji:   { fontSize: 14 },
  reactionCount:   { fontSize: 11, fontWeight: '700', color: Colors.muted },

  // Other players preds
  showPredsBtn: { marginTop: 8, paddingVertical: 6, alignItems: 'center' },
  showPredsTxt: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  predsList:    { marginTop: 6, gap: 4 },
  predRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: Radius.md, backgroundColor: Colors.cardAlt },
  predRowExact: { backgroundColor: Colors.gold + '20', borderWidth: 1, borderColor: Colors.gold + '60' },
  predRowHit:   { backgroundColor: Colors.green + '15', borderWidth: 1, borderColor: Colors.green + '40' },
  predAvatar:   { fontSize: 16 },
  predName:     { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.ink },
  predScore:    { fontSize: 14, fontWeight: '800', color: Colors.ink },
  predNone:     { fontSize: 11, color: Colors.muted, fontStyle: 'italic' },
  predPts:      { fontSize: 11, fontWeight: '800', color: Colors.green, backgroundColor: Colors.green + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  predPtsExact: { color: Colors.bg, backgroundColor: Colors.gold },

  // Ranking
  rankRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  rankRowMe:    { borderColor: Colors.gold },
  rankPos:      { width: 28, textAlign: 'center', fontSize: 16 },
  rankAvatar:   { fontSize: 22 },
  rankName:     { fontSize: 14, fontWeight: '700', color: Colors.ink },
  rankSub:      { fontSize: 11, color: Colors.muted },
  rankPts:      { fontSize: 18, fontWeight: '900', color: Colors.gold },

  // Groups
  groupCard:    { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  groupTitle:   { fontSize: 14, fontWeight: '800', color: Colors.gold, marginBottom: 8 },
  groupHeader:  { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  groupRowTop:  { },
  groupRowLast: { borderBottomWidth: 0 },
  groupCol:     { width: 28, textAlign: 'center', fontSize: 11, color: Colors.muted, fontWeight: '600' },
  groupTeam:    { fontSize: 12, color: Colors.ink, fontWeight: '600', flex: 1 },
  groupPts:     { color: Colors.gold, fontWeight: '800' },
  dotGreen:     { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },

  // Bracket
  bracketPhase: { fontSize: 13, fontWeight: '800', color: Colors.gold, marginBottom: 8, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  bracketCard:  { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  bracketRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bracketFlag:  { fontSize: 20 },
  bracketTeam:  { flex: 1, fontSize: 13, color: Colors.muted, fontWeight: '600' },
  bracketWinner:{ color: Colors.ink },
  bracketScore: { fontSize: 18, fontWeight: '900', color: Colors.ink, minWidth: 24, textAlign: 'center' },
  bracketPts:   { textAlign: 'right', fontSize: 11, fontWeight: '700', color: Colors.gold, marginTop: 4 },

  // Invite
  inviteTab:    { flex: 1, alignItems: 'center', paddingTop: 40, padding: Spacing.xl, gap: Spacing.lg },
  inviteLabel:  { fontSize: 12, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  inviteCode:   { fontSize: 48, fontWeight: '900', color: Colors.gold, letterSpacing: 10 },
  inviteHint:   { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
  shareFullBtn: { backgroundColor: Colors.green, borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: 32 },
  shareFullTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  inviteCount:  { fontSize: 13, color: Colors.muted },
  playersList:  { alignSelf: 'stretch', gap: 8 },
  playerRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 10, borderWidth: 1, borderColor: Colors.border },
  playerAvatar: { fontSize: 22 },
  playerName:   { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.ink },
  adminBadge:   { fontSize: 10, fontWeight: '700', color: Colors.gold, backgroundColor: Colors.gold + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },

  // Admin
  syncBtn:      { backgroundColor: Colors.blue, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md },
  syncTxt:      { fontSize: 14, fontWeight: '700', color: '#fff' },
  adminCard:    { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  adminMatch:   { fontSize: 13, fontWeight: '600', color: Colors.ink, marginBottom: 8 },
  adminInputRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminInput:   { width: 52, height: 44, textAlign: 'center', fontSize: 18, fontWeight: '800', borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.cardAlt, color: Colors.ink },
  adminSaveBtn: { flex: 1, backgroundColor: Colors.green, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
  adminSaveTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, paddingBottom: 40, maxHeight: '80%' },
  modalTitle:   { fontSize: 22, fontWeight: '900', color: Colors.ink, marginBottom: 4 },
  modalSub:     { fontSize: 12, color: Colors.muted, marginBottom: 16 },
  teamRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.md, marginBottom: 4 },
  teamRowSelected: { backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.gold },
  teamRowFlag:  { fontSize: 24 },
  teamRowName:  { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.ink },
  modalClose:   { marginTop: 16, backgroundColor: Colors.border, borderRadius: Radius.xl, paddingVertical: 14, alignItems: 'center' },
  modalCloseTxt:{ fontSize: 15, fontWeight: '700', color: Colors.ink },
  dayHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  dayHeaderToday:  { borderColor: Colors.gold + '80', backgroundColor: Colors.gold + '10' },
  dayHeaderTxt:    { fontSize: 13, fontWeight: '800', color: Colors.muted },
  dayHeaderTxtToday: { color: Colors.gold },
  dayCount:        { fontSize: 11, color: Colors.muted, backgroundColor: Colors.cardAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  pendingBadge:    { backgroundColor: Colors.gold, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  pendingBadgeTxt: { fontSize: 10, fontWeight: '700', color: Colors.bg },
  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 12 },
  emptyIcon:    { fontSize: 52 },
  emptyTitle:   { fontSize: 18, fontWeight: '800', color: Colors.ink },
  emptyText:    { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
  phaseBtn:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardAlt },
  phaseBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + '20' },
  phaseBtnTxt:  { fontSize: 11, fontWeight: '700', color: Colors.muted },
  phaseBtnTxtActive: { color: Colors.gold },
  removeBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.danger + '30', alignItems: 'center', justifyContent: 'center' },
  removeBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.danger },
});
