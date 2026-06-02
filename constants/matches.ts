export type Phase = 'groups' | 'r32' | 'qf' | 'sf' | 'final';

export interface Match {
  id: string;
  home: string;
  away: string;
  group?: string;
  phase: Phase;
  kickoff: number;
  result: { home: string; away: string };
  locked: boolean;
}

export const PHASE_PTS: Record<Phase, { exact: number; outcome: number }> = {
  groups: { exact: 3, outcome: 1 },
  r32:    { exact: 4, outcome: 2 },
  qf:     { exact: 6, outcome: 3 },
  sf:     { exact: 8, outcome: 4 },
  final:  { exact: 10, outcome: 5 },
};

export const FLAGS: Record<string, string> = {
  "Argentina":"🇦🇷","Brasil":"🇧🇷","España":"🇪🇸","Francia":"🇫🇷","Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Alemania":"🇩🇪","Portugal":"🇵🇹","Países Bajos":"🇳🇱","Croacia":"🇭🇷",
  "México":"🇲🇽","EE.UU.":"🇺🇸","Canadá":"🇨🇦","Uruguay":"🇺🇾","Colombia":"🇨🇴",
  "Bélgica":"🇧🇪","Japón":"🇯🇵","Corea del Sur":"🇰🇷","Marruecos":"🇲🇦","Senegal":"🇸🇳",
  "Sudáfrica":"🇿🇦","Rep. Checa":"🇨🇿","Bosnia":"🇧🇦","Suiza":"🇨🇭","Qatar":"🇶🇦",
  "Haití":"🇭🇹","Escocia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Turquía":"🇹🇷","Australia":"🇦🇺","Paraguay":"🇵🇾",
  "Curazao":"🇨🇼","C. Marfil":"🇨🇮","Ecuador":"🇪🇨","Túnez":"🇹🇳","Egipto":"🇪🇬",
  "Irán":"🇮🇷","N. Zelanda":"🇳🇿","Arabia S.":"🇸🇦","C. Verde":"🇨🇻","Irak":"🇮🇶",
  "Noruega":"🇳🇴","Austria":"🇦🇹","Jordania":"🇯🇴","Argelia":"🇩🇿","RD Congo":"🇨🇩",
  "Uzbekistán":"🇺🇿","Ghana":"🇬🇭","Panamá":"🇵🇦","Suecia":"🇸🇪",
};

export const AVATARS = ["⚽","🏆","🦁","🐺","🦅","🐯","🔥","⚡","🌟","🦊","🐉","🤙","😎","🧠","👑","🎯","🦈","🐻","🦋","🌊","🎭","🦄","🐆","🦉","🦚","🐊","🦝","🦸","🧨","💫"];

const LOCK_MS = 5 * 60 * 1000;

export function flag(team: string): string {
  return FLAGS[team] ?? '⚽';
}

export function isLocked(m: Match, now: number): boolean {
  return m.locked || (!!m.kickoff && now >= m.kickoff - LOCK_MS);
}

export function calcPoints(pred: { home: string; away: string } | undefined, result: { home: string; away: string }, phase: Phase): number {
  if (!pred || pred.home === '' || pred.away === '') return 0;
  if (result.home === '' || result.away === '') return 0;
  const pts = PHASE_PTS[phase];
  if (+pred.home === +result.home && +pred.away === +result.away) return pts.exact;
  const outcome = (a: string, b: string) => +a > +b ? '1' : +a < +b ? '2' : 'X';
  if (outcome(pred.home, pred.away) === outcome(result.home, result.away)) return pts.outcome;
  return 0;
}

// Seeds from the web app
export const SEED_MATCHES: Omit<Match, 'locked' | 'result'>[] = [
  { id:"g0",  home:"México",      away:"Sudáfrica",  group:"A", phase:"groups", kickoff:Date.UTC(2026,5,11,19,0) },
  { id:"g1",  home:"Corea del Sur",away:"Rep. Checa",group:"A", phase:"groups", kickoff:Date.UTC(2026,5,12,1,0) },
  { id:"g2",  home:"Canadá",      away:"Bosnia",     group:"B", phase:"groups", kickoff:Date.UTC(2026,5,12,19,0) },
  { id:"g3",  home:"EE.UU.",      away:"Paraguay",   group:"D", phase:"groups", kickoff:Date.UTC(2026,5,13,1,0) },
  { id:"g4",  home:"Qatar",       away:"Suiza",      group:"B", phase:"groups", kickoff:Date.UTC(2026,5,13,19,0) },
  { id:"g5",  home:"Brasil",      away:"Marruecos",  group:"C", phase:"groups", kickoff:Date.UTC(2026,5,13,22,0) },
  { id:"g6",  home:"Haití",       away:"Escocia",    group:"C", phase:"groups", kickoff:Date.UTC(2026,5,14,1,0) },
  { id:"g7",  home:"Australia",   away:"Turquía",    group:"D", phase:"groups", kickoff:Date.UTC(2026,5,13,16,0) },
  { id:"g8",  home:"Alemania",    away:"Curazao",    group:"E", phase:"groups", kickoff:Date.UTC(2026,5,14,16,0) },
  { id:"g9",  home:"Países Bajos",away:"Japón",      group:"F", phase:"groups", kickoff:Date.UTC(2026,5,14,19,0) },
  { id:"g10", home:"C. Marfil",   away:"Ecuador",    group:"E", phase:"groups", kickoff:Date.UTC(2026,5,14,22,0) },
  { id:"g11", home:"Suecia",      away:"Túnez",      group:"F", phase:"groups", kickoff:Date.UTC(2026,5,15,1,0) },
  { id:"g12", home:"España",      away:"C. Verde",   group:"H", phase:"groups", kickoff:Date.UTC(2026,5,15,16,0) },
  { id:"g13", home:"Bélgica",     away:"Egipto",     group:"G", phase:"groups", kickoff:Date.UTC(2026,5,15,19,0) },
  { id:"g14", home:"Arabia S.",   away:"Uruguay",    group:"H", phase:"groups", kickoff:Date.UTC(2026,5,15,22,0) },
  { id:"g15", home:"Irán",        away:"N. Zelanda", group:"G", phase:"groups", kickoff:Date.UTC(2026,5,16,1,0) },
  { id:"g16", home:"Francia",     away:"Senegal",    group:"I", phase:"groups", kickoff:Date.UTC(2026,5,16,19,0) },
  { id:"g17", home:"Irak",        away:"Noruega",    group:"I", phase:"groups", kickoff:Date.UTC(2026,5,16,22,0) },
  { id:"g18", home:"Argentina",   away:"Argelia",    group:"J", phase:"groups", kickoff:Date.UTC(2026,5,17,1,0) },
  { id:"g19", home:"Austria",     away:"Jordania",   group:"J", phase:"groups", kickoff:Date.UTC(2026,5,16,16,0) },
  { id:"g20", home:"Portugal",    away:"RD Congo",   group:"K", phase:"groups", kickoff:Date.UTC(2026,5,17,17,0) },
  { id:"g21", home:"Ghana",       away:"Panamá",     group:"L", phase:"groups", kickoff:Date.UTC(2026,5,17,19,0) },
  { id:"g22", home:"Inglaterra",  away:"Croacia",    group:"L", phase:"groups", kickoff:Date.UTC(2026,5,17,20,0) },
  { id:"g23", home:"Uzbekistán",  away:"Colombia",   group:"K", phase:"groups", kickoff:Date.UTC(2026,5,17,23,0) },
];

export function buildInitialMatches(): Match[] {
  return SEED_MATCHES.map(m => ({ ...m, locked: false, result: { home: '', away: '' } }));
}
