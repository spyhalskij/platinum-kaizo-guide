// Snapshot per-set trainer IVs/EVs from PKCalc (official Platinum Kaizo calc), used for actual Speed.
// Source: https://pkcalc.anastarawneh.com/js/data/sets.js (SETDEX_PK). Run: node scripts/fetch-pkcalc-ivs.mjs
import fs from 'node:fs';
const URL_='https://pkcalc.anastarawneh.com/js/data/sets.js';
const src=await (await fetch(URL_)).text(); const S=new Function(src.replace('const SETDEX_PK','return SETDEX_PK').replace(/;?\s*$/,'')+';')();
const out={source:URL_,fetched:new Date().toISOString(),evDefault:0,sets:[]};
for (const [species,o] of Object.entries(S)) for (const [trainer,s] of Object.entries(o)) out.sets.push({species,trainer,level:s.level,nature:s.nature,ivs:s.ivs,evs:s.evs||null});
fs.writeFileSync(new URL('../data/pkcalc-trainer-sets.json',import.meta.url),JSON.stringify(out));
console.log('sets',out.sets.length);
