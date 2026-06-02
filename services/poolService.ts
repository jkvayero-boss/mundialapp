import { db } from './firebase';
import { ref, set, get, onValue, push, update } from 'firebase/database';
import { buildInitialMatches, Match } from '../constants/matches';

export interface Player {
  uid: string;
  name: string;
  avatar: string;
}

export interface PoolMeta {
  id: string;
  name: string;
  adminUid: string;
  inviteCode: string;
  created: number;
  lang: string;
}

function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createPool(adminUid: string, adminName: string, adminAvatar: string, poolName: string, lang: string): Promise<string> {
  const poolRef = push(ref(db, 'pools'));
  const poolId = poolRef.key!;
  const inviteCode = makeInviteCode();
  const meta: PoolMeta = { id: poolId, name: poolName, adminUid, inviteCode, created: Date.now(), lang };
  const matches = buildInitialMatches();
  const matchesObj: Record<string, Match> = {};
  matches.forEach(m => { matchesObj[m.id] = m; });
  await set(poolRef, {
    meta, matches: matchesObj,
    players: { [adminUid]: { uid: adminUid, name: adminName, avatar: adminAvatar } },
    predictions: {}, champion: {}, reactions: {},
  });
  await set(ref(db, `invite_codes/${inviteCode}`), poolId);
  return poolId;
}

export async function joinPool(inviteCode: string, uid: string, name: string, avatar: string): Promise<string | null> {
  const codeSnap = await get(ref(db, `invite_codes/${inviteCode.toUpperCase()}`));
  if (!codeSnap.exists()) return null;
  const poolId = codeSnap.val() as string;
  await set(ref(db, `pools/${poolId}/players/${uid}`), { uid, name, avatar });
  return poolId;
}

export function subscribePool(poolId: string, cb: (data: any) => void) {
  return onValue(ref(db, `pools/${poolId}`), snap => { if (snap.exists()) cb(snap.val()); });
}

export async function savePrediction(poolId: string, uid: string, matchId: string, home: string, away: string) {
  await set(ref(db, `pools/${poolId}/predictions/${uid}/${matchId}`), { home, away });
}

export async function savePredictionSide(poolId: string, uid: string, matchId: string, side: 'home' | 'away', val: string) {
  await set(ref(db, `pools/${poolId}/predictions/${uid}/${matchId}/${side}`), val);
}

export async function saveChampion(poolId: string, uid: string, team: string) {
  await set(ref(db, `pools/${poolId}/champion/${uid}`), team);
}

export async function saveReaction(poolId: string, matchId: string, emoji: string, count: number) {
  await set(ref(db, `pools/${poolId}/reactions/${matchId}/${emoji}`), count);
}

export async function updateMatchResult(poolId: string, matchId: string, home: string, away: string) {
  await update(ref(db, `pools/${poolId}/matches/${matchId}`), {
    result: { home, away }, locked: true,
  });
}

export async function removePlayer(poolId: string, uid: string) {
  await set(ref(db, `pools/${poolId}/players/${uid}`), null);
}

export async function addKnockoutMatch(poolId: string, match: {
  home: string; away: string; phase: string; kickoff: number;
}) {
  const matchRef = push(ref(db, `pools/${poolId}/matches`));
  await set(matchRef, {
    id: matchRef.key,
    home: match.home,
    away: match.away,
    phase: match.phase,
    kickoff: match.kickoff,
    result: { home: '', away: '' },
    locked: false,
  });
}

export async function syncResultsFromAPI(poolId: string, matches: Match[]): Promise<number> {
  try {
    const res = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026', {
      headers: { 'x-apisports-key': '95ea5f8bce0ce8bdeba48f077d4751e9' },
    });
    const data = await res.json();
    const fixtures = data.response || [];
    if (!fixtures.length) return 0;
    const NAME_MAP: Record<string, string> = {
      "Spain":"España","France":"Francia","Germany":"Alemania","Brazil":"Brasil","Argentina":"Argentina",
      "Portugal":"Portugal","England":"Inglaterra","Netherlands":"Países Bajos","Belgium":"Bélgica",
      "Croatia":"Croacia","Mexico":"México","United States":"EE.UU.","USA":"EE.UU.",
      "Canada":"Canadá","Uruguay":"Uruguay","Colombia":"Colombia","Japan":"Japón",
      "South Korea":"Corea del Sur","Korea Republic":"Corea del Sur","Morocco":"Marruecos",
      "Senegal":"Senegal","South Africa":"Sudáfrica","Czech Republic":"Rep. Checa",
      "Czechia":"Rep. Checa","Switzerland":"Suiza","Australia":"Australia","Paraguay":"Paraguay",
      "Ivory Coast":"C. Marfil","Ecuador":"Ecuador","Sweden":"Suecia","Tunisia":"Túnez",
      "Egypt":"Egipto","Iran":"Irán","New Zealand":"N. Zelanda","Saudi Arabia":"Arabia S.",
      "Iraq":"Irak","Norway":"Noruega","Austria":"Austria","Algeria":"Argelia",
      "DR Congo":"RD Congo","Uzbekistan":"Uzbekistán","Ghana":"Ghana","Panama":"Panamá",
      "Haiti":"Haití","Scotland":"Escocia","Turkey":"Turquía","Jordan":"Jordania",
      "Curacao":"Curazao","Cape Verde":"C. Verde","Qatar":"Qatar","Bosnia and Herzegovina":"Bosnia",
    };
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const mapN = (n: string) => NAME_MAP[n] || n;
    const GROUP_END = Date.UTC(2026, 5, 28);
    let updated = 0;
    for (const fix of fixtures) {
      const hR = fix.teams?.home?.name;
      const aR = fix.teams?.away?.name;
      const gh = fix.goals?.home;
      const ga = fix.goals?.away;
      const status: string = fix.fixture?.status?.short ?? '';
      const kickoffMs: number = fix.fixture?.date ? new Date(fix.fixture.date).getTime() : 0;
      if (!hR || !aR) continue;
      const hE = mapN(hR);
      const aE = mapN(aR);
      // Actualitzar resultats de partits acabats
      if (status === 'FT' && gh != null && ga != null) {
        const m = matches.find(m =>
          (norm(m.home) === norm(hR) || norm(m.home) === norm(hE)) &&
          (norm(m.away) === norm(aR) || norm(m.away) === norm(aE))
        );
        if (m && m.result.home === '') {
          await updateMatchResult(poolId, m.id, String(gh), String(ga));
          updated++;
        }
      }
      // Auto-crear partits eliminatoris amb equips coneguts
      const r = (fix.league?.round ?? '').toLowerCase();
      const isKO = kickoffMs >= GROUP_END && !r.includes('group');
      const teamsKnown = hR !== 'TBD' && aR !== 'TBD' && hE && aE;
      if (isKO && teamsKnown) {
        const exists = matches.find(m => norm(m.home) === norm(hE) && norm(m.away) === norm(aE));
        if (!exists) {
          let phase = 'r32';
          if (r.includes('quarter') || r.includes('1/4')) phase = 'qf';
          else if (r.includes('semi') || r.includes('1/2')) phase = 'sf';
          else if (r.includes('final') || r.includes('3rd') || r.includes('bron')) phase = 'final';
          await addKnockoutMatch(poolId, { home: hE, away: aE, phase, kickoff: kickoffMs });
          updated++;
        }
      }
    }
    return updated;
  } catch {
    return -1;
  }
}
