// Format: [slotA, slotB] where slot = "1A" (1st group A), "2B" (2nd group B), "M3" (best 3rd)
export const OCTAVOS: [string, string][] = [
  ["1A","2B"],["1C","2D"],["1E","2F"],["1G","2H"],
  ["1I","2J"],["1K","2L"],["1B","2A"],["1D","2C"],
  ["1F","2E"],["1H","2G"],["1J","2I"],["1L","2K"],
  ["M3","N3"],["O3","P3"],
];

export const GRUPOS: Record<string, string[]> = {
  A: ["México","Corea del Sur","Rep. Checa","Sudáfrica"],
  B: ["Canadá","Qatar","Suiza","Bosnia"],
  C: ["Brasil","Marruecos","Haití","Escocia"],
  D: ["EE.UU.","Turquía","Australia","Paraguay"],
  E: ["Alemania","C. Marfil","Ecuador","Curazao"],
  F: ["Países Bajos","Japón","Suecia","Túnez"],
  G: ["Bélgica","Irán","N. Zelanda","Egipto"],
  H: ["España","Uruguay","Arabia S.","C. Verde"],
  I: ["Francia","Noruega","Senegal","Irak"],
  J: ["Argentina","Jordania","Argelia","Austria"],
  K: ["Portugal","Colombia","RD Congo","Uzbekistán"],
  L: ["Inglaterra","Croacia","Ghana","Panamá"],
};

export const REACTIONS = ["🔥","😬","🤡","😱","💀","🎯","👏","🤦"];

export function calcTabla(grupo: string, matches: any[]) {
  const equipos = GRUPOS[grupo] || [];
  const t: Record<string, any> = {};
  equipos.forEach(e => { t[e] = { e, pj: 0, g: 0, em: 0, p: 0, gf: 0, gc: 0, pts: 0 }; });
  matches.forEach(m => {
    if (!equipos.includes(m.home) || !equipos.includes(m.away)) return;
    if (m.result.home === '' || m.result.away === '') return;
    const gh = +m.result.home, ga = +m.result.away;
    t[m.home].pj++; t[m.away].pj++;
    t[m.home].gf += gh; t[m.home].gc += ga;
    t[m.away].gf += ga; t[m.away].gc += gh;
    if (gh > ga) { t[m.home].g++; t[m.home].pts += 3; t[m.away].p++; }
    else if (gh < ga) { t[m.away].g++; t[m.away].pts += 3; t[m.home].p++; }
    else { t[m.home].em++; t[m.home].pts++; t[m.away].em++; t[m.away].pts++; }
  });
  return Object.values(t).sort((a: any, b: any) =>
    b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf
  );
}
