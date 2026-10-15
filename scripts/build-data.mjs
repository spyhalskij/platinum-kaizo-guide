// Build-time loader: reads ONLY the reference dir and emits src/data/*.json
import fs from 'node:fs'; import path from 'node:path'; import Papa from 'papaparse';
const REF = process.env.KAIZO_REF || '/home/box/agent-data/workflows/platinum-kaizo-guide/reference';
if (!fs.existsSync(path.join(REF,'data'))) { console.log(`[build-data] reference dir ${REF} not found; using committed src/data/*.json and public/search-index.json`); process.exit(0); }
const OUT = new URL('../src/data/', import.meta.url).pathname; fs.mkdirSync(OUT,{recursive:true});
const csv = f => Papa.parse(fs.readFileSync(path.join(REF,'data',f),'utf8'),{skipEmptyLines:false}).data;
const md = f => fs.readFileSync(path.join(REF,f),'utf8');
const clean = s => (s??'').replace(/\s+/g,' ').trim();
const key = s => clean(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
const slug = s => clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const num = s => { const n=parseFloat(s); return Number.isFinite(n)? n : null; };
const title = s => clean(s).toLowerCase().replace(/(^|[\s\-(.])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
const write = (n,o)=>fs.writeFileSync(OUT+n+'.json',JSON.stringify(o));
// level fix: spreadsheet turned "4-6" into dates
const lvl = s => { s=clean(s); let m=s.match(/^\d{4}-(\d{2})-(\d{2})/); if(m) return `${+m[1]}-${+m[2]}`; return s.replace(/\.0$/,''); };

// ---- Pokedex
const dex = csv('pokedex-personal.csv'); const H=dex[0];
const mons = {};
for (const r of dex.slice(1)) { if(!r[1]||r[1]==='-----') continue; const o=Object.fromEntries(H.map((h,i)=>[h,r[i]]));
  const name=title(o.Name); mons[key(name)] = { id:num(o['ID Number']), name, slug:slug(name),
    types:[o['Type 1'],o['Type 2']].filter((t,i,a)=>t&&a.indexOf(t)===i),
    stats:{HP:o.HP,Atk:o.Attack,Def:o.Defense,SpA:o['Sp. Atk'],SpD:o['Sp. Def'],Spe:o.Speed,BST:o.BST},
    abilities:[o['Ability 1'],o['Ability 2']].filter((t,i,a)=>t&&t!=='-'&&a.indexOf(t)===i),
    catchRate:o['Catch Rate'], growth:o['Growth Rate'], items:[o['Uncommon Held Item'],o['Rare Held Item']].filter(x=>x&&x!=='None'),
    levelUp:[], tms:[], evo:[], evoFrom:[], locations:[] }; }
const M = n => mons[key(n)];
for (const r of csv('level-up-learnsets.csv').slice(1)) { const m=M(r[1]); if(!m) continue;
  for(let i=2;i<r.length;i+=2) if(clean(r[i])) m.levelUp.push([num(r[i+1]),clean(r[i])]); }
const tl = csv('tm-learnsets.csv'); const tmCodes=tl[0], tmMoves=tl[1];
for (const r of tl.slice(2)) { const m=M(r[1]); if(!m) continue; for(let i=2;i<r.length;i++) if(r[i]==='True') m.tms.push([tmCodes[i],clean(tmMoves[i])]); }
for (const r of csv('evolutions.csv').slice(1)) { const m=M(r[1]); if(!m) continue;
  for(let i=2;i<r.length;i+=3){ if(!r[i]||r[i]==='None') continue; const tgt=M(r[i+2]);
    const e={method:clean(r[i]),req:clean(r[i+1]).replace(/\.0$/,''),to:tgt?tgt.name:title(r[i+2]),toSlug:tgt?.slug};
    m.evo.push(e); if(tgt) tgt.evoFrom.push({...e,from:m.name,fromSlug:m.slug}); } }

// ---- Encounters (wide sheet: 4 cols per area)
const eg = csv('encounters-general.csv'); const areas={}; const order=[];
const methodName = s => ({'Grass෴':'Grass','☼':'Grass (day)','☾':'Grass (night)','Surf🌊':'Surf','OLD🪝':'Old Rod','GOOD🪝':'Good Rod','SUPER🪝':'Super Rod'})[s];
function route(name){ name=clean(name); const s=slug(name); if(!areas[s]){areas[s]={name,slug:s,enc:{},trainers:[],items:[]};order.push(s);} return areas[s]; }
for (let c=2;c<eg[0].length;c+=4){ const nm=clean(eg[0][c]); if(!nm) continue; const a=route(nm); let method='Grass';
  for (const r of eg.slice(4)){ const ml=methodName(r[0]); if(ml) method=ml; const mon=clean(r[c+1]); if(!mon||!M(mon)) continue; if(clean(r[c])&&!/%$/.test(clean(r[c]))) continue;
    (a.enc[method] ??= []).push({rate:clean(r[c]),mon,lvl:lvl(r[c+2])});
    const m=M(mon); if(m && !m.locations.some(l=>l.slug===a.slug&&l.method===method)) m.locations.push({area:a.name,slug:a.slug,method}); } }
for (const a of Object.values(areas)) for (const k in a.enc) for (const e of a.enc[k]) { const m=M(e.mon); e.slug=m?.slug; }

const moves={}; for (const r of csv('moves.csv').slice(1)) if(r[1]&&r[1]!=='-') moves[key(r[1])]={name:r[1],effect:r[2],cat:r[3],power:num(r[4]),type:r[5],acc:num(r[6]),pp:num(r[7])};
// ---- Trainers from parsed split markdown
const splits=['roark','gardenia','fantina','maylene','wake','byron','candice','volkner','galactic','elitefour'];
const trainers=[]; 
for (const sp of splits){ let area='',cur=null,mon=null; const split=title(sp==='elitefour'?'Elite Four':sp);
  for (const line of md(`trainers/${sp}.md`).split('\n')){
    let m;
    if((m=line.match(/^## (.+)/))){ if(!moves[key(m[1])] && !/^HP \w+$/.test(m[1])) area=clean(m[1]); }
    else if((m=line.match(/^### (.+)/))){ cur={name:clean(m[1]),area,split,team:[]}; trainers.push(cur); }
    else if(cur&&(m=line.match(/^- \*\*(.+?)\*\*\s*(?:\((.*)\))?/))){ const [nat,ab,...it]=(m[2]||'').split(' / ');
      const nm=m[1].replace(/^Lv\s*\d+\s*/,'').replace(/[♂♀]/g,'').trim(); const pm=M(nm);
      mon={label:m[1],nature:nat||'',ability:ab||'',item:it.join(' / '),moves:[],slug:pm?.slug}; cur.team.push(mon); }
    else if(mon&&(m=line.match(/^\s+- Moves:\s*(.+)/))) mon.moves=m[1].split(',').map(clean);
    else if(cur && line.trim() && !line.startsWith('_') && !line.startsWith('#') && cur.team.length===0 && !line.startsWith('-')) cur.note=(cur.note?cur.note+' ':'')+clean(line);
  } }
trainers.forEach((t,i)=>{ t.id=i; t.slug=slug(t.split+'-'+t.name)+'-'+i; });
// ---- Progression order (prev/next). Split order = walkthrough-index.md story beats (Candice + Galactic arc before Volkner);
// within a split = area/trainer order of the split sheet (trainers/<split>.md, parsed from the mastersheet tabs).
{ const PROG=['roark','gardenia','fantina','maylene','wake','byron','candice','galactic','volkner','elitefour'].map(x=>title(x==='elitefour'?'Elite Four':x));
  const seq=[...trainers].sort((a,b)=>PROG.indexOf(a.split)-PROG.indexOf(b.split)||a.id-b.id);
  const STARTER=/\b(chimchar|piplup|turtwig)\b/i;
  const vbase=n=>key(n.replace(/\([^)]*(chose|selected|picked)[^)]*\)/ig,'').replace(/\[[^\]]*\]/g,''));
  const partner=n=>(n.match(/MU(?:LT|TL)I BATTLE with\s+([^,)]+)/i)||[])[1];
  const lastWord=s=>key(clean(s).split(/\s+/).pop());
  const steps=[];
  for (const t of seq){ const prev=steps[steps.length-1]; const pt=prev&&prev.ids.length&&trainers[prev.ids[prev.ids.length-1]];
    t.optional=/OPTIONAL/i.test(t.name);
    let join=null;
    // Explicit override: confirmed by Jack (2026-10-15) that these two sheet entries are ONE double battle.
    const DOUBLE_PAIRS=[['Galactic Squad Deimos (DOUBLE)','Galactic Squad Phobos (DOUBLE)']];
    if(pt&&DOUBLE_PAIRS.some(([x,y])=>pt.name===x&&t.name===y)&&prev.ids.length===1) join='double';
    if(pt&&pt.split===t.split&&pt.area===t.area){
      if(vbase(pt.name)===vbase(t.name)&&vbase(t.name)!==key(t.name)) join='variant';
      else if(partner(pt.name)&&partner(t.name)&&(key(t.name).includes(lastWord(partner(pt.name)))||key(pt.name).includes(lastWord(partner(t.name))))&&prev.ids.length<2) join='multi'; }
    if(join&&(prev.kind==='single'||prev.kind===join)){ prev.ids.push(t.id); prev.kind=join; prev.optional=prev.optional&&t.optional; }
    else steps.push({ids:[t.id],kind:'single',optional:t.optional}); }
  steps.forEach((st,i)=>st.ids.forEach(id=>trainers[id].step=i));
  const walk=(i,dir)=>{ const out=[]; for(let j=i+dir;j>=0&&j<steps.length;j+=dir){ out.push(steps[j]); if(!steps[j].optional) break; } return out; };
  const pick=(t,st)=>{ const m=t.name.match(STARTER); let ids=st.ids; if(m&&st.kind==='variant'){ const f=ids.filter(id=>trainers[id].name.toLowerCase().includes(m[1].toLowerCase())); if(f.length) ids=f; } return {ids,kind:st.kind,optional:st.optional}; };
  for (const t of trainers){ const i=t.step; t.next=walk(i,1).map(st=>pick(t,st)); t.prev=walk(i,-1).map(st=>pick(t,st));
    const st=steps[i]; t.with=st.kind==='multi'?st.ids.filter(x=>x!==t.id):[]; t.alts=st.kind==='variant'?st.ids.filter(x=>x!==t.id):[]; }
  // ---- Fights: a MULTI BATTLE pair = one fight; everything else = one fight per trainer entry
  const cleanName=n=>clean(n
    .replace(/([a-z])[fF](?=[A-Z][a-z])/g,'$1 ')            // sheet gender-tag glitch glued to the name: GalacticfVenus, CyclistFRachel, School KidfChristine
    .replace(/\b(Galactic)f\s/g,'$1 ')                        // "Galacticf Venus"
    .replace(/,?\s*MU(?:LT|TL)I BATTLE with\s+[^,)]+/ig,'')   // partner suffix (kept other notes in the brackets)
    .replace(/\(\s*,\s*/g,'(').replace(/\(\s*\)/g,'').replace(/\s+\*/g,'*')
    .replace(/\bDOUBLE BATTLE\b|\bDOUBLE\b(?! Team)/g,'double battle').replace(/\bDouble Battle\b/g,'double battle'));
  trainers.forEach(t=>t.display=cleanName(t.name));
  const fights=[]; const fightOf={};
  steps.forEach((st,i)=>{ const mk=ids=>{ const ms=ids.map(id=>trainers[id]); const t0=ms[0];
      const paren=n=>(n.match(/\(.*\)\*?$/)||[''])[0], bare=n=>clean(n.slice(0,n.length-paren(n).length));
      const same=ms.length>1&&ms.every(m=>paren(m.display)===paren(t0.display));
      const title=ms.length>1? (same? ms.map(m=>bare(m.display)).join(' + ')+(paren(t0.display)?' '+paren(t0.display):'') : ms.map(m=>m.display).join(' + '))+(st.kind==='double'?' (double battle)':' (multi battle)') : t0.display;
      const title2=title.replace(/\(double battle\) \(double battle\)$/,'(double battle)');
      const f={id:fights.length,slug:ms.length>1? slug(t0.split+'-'+ms.map(m=>m.display.replace(/\(.*?\)/g,'')).join('-')+'-'+st.kind)+'-'+t0.id : t0.slug,
        title:title2,kind:ms.length>1?st.kind:'single',members:ids,area:t0.area,areaSlug:t0.areaSlug,split:t0.split,optional:st.optional,step:i};
      fights.push(f); ids.forEach(id=>{fightOf[id]=f.id; trainers[id].fight=f.id;}); return f; };
    if(st.kind==='multi'||st.kind==='double') st.fids=[mk(st.ids).id]; else st.fids=st.ids.map(id=>mk([id]).id); });
  const fwalk=(i,dir)=>{ const out=[]; for(let j=i+dir;j>=0&&j<steps.length;j+=dir){ out.push(steps[j]); if(!steps[j].optional) break; } return out; };
  for (const f of fights){ const t0=trainers[f.members[0]]; const m=t0.name.match(STARTER);
    const pickF=st=>{ let fids=st.fids; if(m&&st.kind==='variant'){ const g=fids.filter(fid=>trainers[fights[fid].members[0]].name.toLowerCase().includes(m[1].toLowerCase())); if(g.length) fids=g; } return {fights:fids,kind:st.kind,optional:st.optional}; };
    f.next=fwalk(f.step,1).map(pickF); f.prev=fwalk(f.step,-1).map(pickF);
    f.alts=steps[f.step].kind==='variant'?steps[f.step].fids.filter(x=>x!==f.id):[]; }
  // Explicit override: per Jack (2026-10-15), these separate fights CAN also be fought together as a double battle (not in docs).
  const OPTIONAL_DOUBLE=[['GalacticfSquad Phobos (DOUBLE BATTLE)','GalacticfSquad Deimos (OPTIONAL DOUBLE BATTLE)']];
  for (const [x,y] of OPTIONAL_DOUBLE){ const fx=fights.find(f=>f.kind==='single'&&trainers[f.members[0]].name===x), fy=fights.find(f=>f.kind==='single'&&trainers[f.members[0]].name===y);
    if(!fx||!fy) throw new Error('OPTIONAL_DOUBLE override not matched: '+x+' / '+y); fx.alsoDouble=fy.id; fy.alsoDouble=fx.id; }
  globalThis.FIGHTS=fights;
  console.log('fights',fights.length,'multi fights',fights.filter(f=>f.kind==='multi').length,'MULTI-named trainers not paired',JSON.stringify(trainers.filter(t=>/MU(LT|TL)I/i.test(t.name)&&fights[t.fight].kind!=='multi').map(t=>t.name)));
  const multiNext=trainers.filter(t=>t.next.reduce((n,o)=>n+o.ids.length,0)>1).length;
  console.log('progression steps',steps.length,'trainers with >1 next option',multiNext,'kinds',JSON.stringify(steps.reduce((c,s)=>(c[s.kind]=(c[s.kind]||0)+1,c),{})),'optional steps',steps.filter(s=>s.optional).length);
}
const baseArea=n=>clean(n.replace(/\(.*?\)/g,'').replace(/\*/g,'').replace(/ - Requires.*$/,'')); for (const t of trainers){ const a=areas[slug(baseArea(t.area))] ?? route(baseArea(t.area)); a.trainers.push(t.id); t.areaSlug=a.slug; }

// ---- Actual in-battle Speed for trainer Pokémon (Gen 4 formula, EV 0, IV range 0-31: trainer IV rule not documented)
const NAT={Lonely:[1,0],Brave:[1,4],Adamant:[1,2],Naughty:[1,3],Bold:[0,1],Relaxed:[4,1],Impish:[2,1],Lax:[3,1],Timid:[4,0],Hasty:[4,1],Jolly:[4,2],Naive:[4,3],Modest:[2,0],Mild:[2,1],Quiet:[2,4],Rash:[2,3],Calm:[3,0],Gentle:[3,1],Sassy:[3,4],Careful:[3,2]};
// index: 0 Atk,1 Def,2 SpA,3 SpD,4 Spe -> [up,down]
const spdMods=n=>{ const ns=clean(n).split('/').map(clean).filter(Boolean); const ok=ns.filter(x=>NAT[x]||['Hardy','Docile','Serious','Bashful','Quirky'].includes(x));
  if(!ns.length||ok.length!==ns.length) return {mods:[0.9,1.1],known:false}; return {mods:ok.map(x=>{const e=NAT[x]; return !e?1:e[0]===4?1.1:e[1]===4?0.9:1;}),known:true}; };
const spdStat=(base,iv,lv,mod)=>Math.floor((Math.floor((2*base+iv)*lv/100)+5)*mod);
const FORM={'wormadamsandy':'wormadam-s','wormadamtrash':'wormadam-t','deoxysspeed':'deoxys-s','deoxysdefense':'deoxys-d','deoxysattack':'deoxys-a','giratinaorigin':'giratina-o','shelloswest':'shellos','shelloseast':'shellos','burmysandy':'burmy','burmytrash':'burmy','burmyplant':'burmy','nidoranm':'nidoran','nidoranf':'NIDF'};
const bySlug=Object.fromEntries(Object.values(mons).map(x=>[x.slug,x]));
const nidF=Object.values(mons).find(x=>x.name==='Nidoran♀'); if(nidF) FORM.nidoranf=nidF.slug;
// PKCalc trainer sets snapshot (data/pkcalc-trainer-sets.json from scripts/fetch-pkcalc-ivs.mjs): per-set IVs, EVs default 0
const PK=JSON.parse(fs.readFileSync(new URL('../data/pkcalc-trainer-sets.json',import.meta.url),'utf8'));
const PKF={nidoran:'nidoranm','wormadam-s':'wormadamsandy','wormadam-t':'wormadamtrash','deoxys-s':'deoxysspeed','deoxys-d':'deoxysdefense','deoxys-a':'deoxysattack','giratina-o':'giratinaorigin'};
const STOP=new Set(['pokemon','trainer','player','chose','selected','picked','tag','partner','the']);
const toks=s=>new Set((s||'').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>1&&!STOP.has(w)));
const pkBySp={}; for(const x of PK.sets)(pkBySp[key(x.species)]??=[]).push(x);
function pkSet(t,p,lv){ const sp=PKF[p.slug]||key(bySlug[p.slug].name); const tt=toks(t.name); const nats=clean(p.nature).split('/').map(clean);
  let c=(pkBySp[sp]||[]).filter(x=>x.level===lv).map(x=>({x,o:[...toks(x.trainer)].filter(w=>tt.has(w)).length,n:nats.includes(x.nature)})).filter(y=>y.o>0);
  const best=Math.max(0,...c.map(y=>y.o*2+(y.n?1:0))); c=c.filter(y=>y.o*2+(y.n?1:0)===best);
  const ivs=new Set(c.map(y=>y.x.ivs.sp+'/'+(y.x.evs?.sp??0))); return ivs.size===1?c[0].x:null; }
for (const t of trainers) for (const p of t.team){ const lv=num((p.label.match(/Lv\.?\s*(\d+)/i)||[])[1]);
  if(!p.slug){ const nm=p.label.replace(/Lv\.?\s*\d+/i,'').replace(/[♂♀\/]/g,'').trim(); const f=FORM[key(nm)]; if(f&&bySlug[f]) p.slug=f; }
  const mon=p.slug&&bySlug[p.slug]; const base=mon&&num(mon.stats.Spe);
  if(lv&&base!=null){ const {mods,known}=spdMods(p.nature); const set=pkSet(t,p,lv);
    if(set){ const iv=set.ivs.sp, ev=set.evs?.sp??0; const f=(m)=>Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+5)*m);
      p.spe={min:f(Math.min(...mods)),max:f(Math.max(...mods)),lv,base,iv,ev,natureKnown:known,src:'pkcalc',pkTrainer:set.trainer}; }
    else p.spe={min:spdStat(base,0,lv,Math.min(...mods)),max:spdStat(base,31,lv,Math.max(...mods)),lv,base,natureKnown:known,src:'range'}; } }

// ---- Items: checklist (location) + TMs + shards + heart scales + mastersheet (price/pocket)
const master={}; const ms=csv('items-mastersheet.csv'); const MH=ms[0];
for (const r of ms.slice(1)){ const o=Object.fromEntries(MH.map((h,i)=>[h,r[i]])); if(o.Name&&o.Name!=='None') master[key(o.Name)]={price:num(o.Price),pocket:o['Field Bag'],flingPower:num(o['Fling Power']),naturalGift:o['Natural Gift Type']}; }
const items=[];
function loadList(f,cat,offset){ const rows=csv(f); let area='';
  for (const r of rows.slice(1)){ const c=r.map(clean); const nonEmpty=c.filter(Boolean);
    if(!nonEmpty.length) continue;
    if(nonEmpty.length===1 && c[0]){ area=c[0]; continue; }
    const name=c[offset], loc=c[offset+1], req=c[offset+2]; if(!name||/^(True|False)$/.test(name)) continue;
    const base=name.replace(/\s*x\d+$/i,'').trim(); const qty=(name.match(/x(\d+)$/i)||[])[1];
    let category=cat, move=null; const tm=base.match(/^(TM|HM)\s*(\d+)\s*-\s*(.+)$/i);
    if(tm){ category=tm[1].toUpperCase(); move=moves[key(tm[3])]||{name:tm[3]}; }
    items.push({name:base,qty:qty?+qty:null,area,areaSlug:slug(area),loc,req,category,move,info:master[key(base)]||null}); } }
loadList('items-checklist.csv','Item',1); loadList('tm-checklist.csv','TM',0); loadList('shards-checklist.csv','Shard/Star Piece',0);
// heart scales sheet: name+location packed in col 0
{ let area=''; for (const r of csv('heart-scales.csv').slice(1)){ const c=r.map(clean); if(!c.some(Boolean)) continue;
  if(c.filter(Boolean).length===1){area=c[0];continue;} items.push({name:'Heart Scale',qty:null,area,areaSlug:slug(area),loc:c[0],req:c[1],category:'Heart Scale',move:null,info:master['heartscale']||null}); } }
// de-dupe exact duplicates across sheets
const seen=new Set(); const itemsU=items.filter(i=>{const k=[key(i.name),i.area,i.loc].join('|'); if(seen.has(k))return false; seen.add(k); return true;});
for (const it of itemsU){ if(!it.area) continue; const a=areas[it.areaSlug] ?? route(it.area); a.items.push(itemsU.indexOf(it)); }

// ---- Gyms
const gymDefs=[['roark','Roark','Leader Roark'],['gardenia','Gardenia','Leader Gardenia'],['fantina','Fantina','Leader Fantina'],['maylene','Maylene','Leader Maylene'],['wake','Crasher Wake','Leader CrasherWake'],['byron','Byron','Leader Byron'],['candice','Candice','LEADER CANDICE'],['volkner','Volkner','Leader Volkner'],['elite-four','Elite Four & Champion','Elite Four|Champion']];
const ga=md('gym-answers.md'); const gaSec={}; ga.split(/\n(?=## )/).forEach(s=>{const h=s.match(/^## (.+)/); if(h) gaSec[h[1]]=s;});
const gyms=gymDefs.map(([s,name,pat],i)=>{ const re=new RegExp('^('+pat+')','i');
  const fights=trainers.filter(t=>re.test(t.name)).map(t=>t.id);
  const sec=Object.entries(gaSec).filter(([h])=>h.toLowerCase().startsWith(name.toLowerCase().split(' ')[0].toLowerCase())).map(([,v])=>v);
  if(s==='elite-four') sec.push(gaSec[Object.keys(gaSec).find(h=>h.startsWith('Field quirks'))]);
  return {slug:s,name,order:i+1,fights,answers:sec.filter(Boolean),split:title(s==='wake'?'Wake':s==='elite-four'?'Elite Four':s)}; });
const gymExtras={intro:ga.split('\n## ')[0], wipes:gaSec[Object.keys(gaSec).find(h=>h.startsWith('Community'))]||''};

// ---- Type chart (parse md)
const types=['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel'];
const chart={}; let at=null;
for (const line of md('type-chart.md').split('\n')){ let m;
  if((m=line.match(/^### (\w+)/))&&types.includes(m[1])){at=m[1];chart[at]={};continue;}
  if(line.startsWith('## ')) at=null;
  if(at&&(m=line.match(/^(SE|NVE|Immune):\s*(.+)/))){ const v={SE:2,NVE:0.5,Immune:0}[m[1]]; m[2].split(',').map(x=>x.replace(/\*/g,'').trim()).filter(x=>types.includes(x)).forEach(d=>chart[at][d]=v); } }
const typeNotes=md('type-chart.md').split('## Common coach traps')[1]||'';

// ---- Special encounters (gifts, trades, eggs, statics, honey trees, game corner, contest, dept store)
// Hand-mapped to the real layout of encounters-nonwild.csv / encounters-universal.csv (multi-line cells).
const special=[]; const unparsed=[];
const lines = s => (s??'').split('\n').map(clean).filter(Boolean);
const blocks = s => (s??'').split(/\n\s*\n/).map(clean).filter(Boolean);
const one = s => clean((s??'').replace(/\n/g,' '));
function addSp(o){ const alias={'wormadamp':'Wormadam'}; o.mons=(o.mons||[]).map(n=>{const m=M(alias[key(n)]||n); return {name:alias[key(n)]?n:(m?m.name:n), slug:m?.slug}});
  const a = o.location && (areas[slug(o.location)] || areas[slug(o.location.replace(/^The /,''))]); o.areaSlug=a?.slug;
  o.id=special.length; special.push(o); }
{ const r=csv('encounters-nonwild.csv');
  // Trades: cols 0-1. Location rows 2,4,6,8,(10 blank). Entry rows +1: "Nick\n(Species)\nNature\nAbility" / requirement = what you give
  for (const [lr,er] of [[2,3],[4,5],[6,7],[8,9],[10,11]]) { const raw=r[er][0]; const L=lines(raw); const sp=(L[1]||'').match(/^\((.+)\)$/);
    if(sp && M(sp[1])) addSp({type:'Trade',location:one(r[lr][0]),mons:[sp[1]],nickname:L[0],nature:L[2]||'',ability:L[3]||'',give:one(r[er][1])||'',req:''});
    else { addSp({type:'Trade',location:one(r[lr][0]),mons:[],nickname:one(raw),nature:'',ability:'',give:one(r[er][1]),req:'',note:'Species not stated in docs (raw cell shown as nickname)'}); unparsed.push({sheet:'encounters-nonwild.csv',where:`trades row ${er+1}`,raw:one(raw),why:'species slot holds "(Justice)", not a Pokémon; location and give cells empty. Kept as a partial trade entry'}); } }
  // Gifts: cols 3-4. Location rows 2,4,6,8,10, entry row +1: "Name\nLv N" / choices
  for (const [lr,er] of [[2,3],[4,5],[6,7],[8,9],[10,11]]) { const L=lines(r[er][3]); const lv=(L.find(x=>/^Lv/i.test(x))||'').replace(/^Lv\s*/i,'');
    const ms=lines(r[er][4]); const known=ms.filter(M); const notMon=ms.filter(x=>!M(x));
    addSp({type:'Gift',location:one(r[lr][3]),name:L.filter(x=>!/^Lv/i.test(x)).join(' '),level:lv,mons:known.length?known:[],choice:known.length>1,
      note:notMon.length?`Options listed: ${notMon.join(', ')}${known.length?'':' (species not named in docs)'}`:''}); }
  // Eggs: cols 6-11; givers row 2, locations row 4, mons row 5, requirements row 11
  for (let c=6;c<=11;c++){ addSp({type:'Egg',giver:one(r[2][c]),location:one(r[4][c]),mons:lines(r[5][c]),req:one(r[11][c])==='None'?'':one(r[11][c]),choice:false,note:'One egg, species from this pool'}); }
  // Game Corner (Veilstone): rows 13-18, header pairs at cols 0 & 3; prizes in cols 0-1 / 3-4 of next row
  for (const hr of [13,15,17]) for (const c of [0,3]) { const tier=one(r[hr][c]); if(!tier) continue;
    addSp({type:'Game Corner',location:'Veilstone City',mons:[...lines(r[hr+1][c]),...lines(r[hr+1][c+1])],req:`Tier listed under “${tier}”`,note:'Prize Pokémon; docs list them under this progress header'}); }
  // Contest Hall rewards: cats row 13, mons row 15, moves row 16 (cols 6-10); requirement col 11 rows 15-16
  const creq=[one(r[15][11]),one(r[16][11])].filter(Boolean).join(' · ');
  for (let c=6;c<=10;c++) addSp({type:'Contest reward',location:'Hearthome City',contest:one(r[13][c]),mons:[one(r[15][c])],moves:lines(r[16][c]),req:creq});
}
{ const r=csv('encounters-universal.csv');
  const ph=['Global','Early','Mid','Late']; ph.forEach((p,c)=>addSp({type:'Honey tree',location:'',phase:p,mons:lines(r[2][c]),note:`${p} pool (any honey tree)`}));
  for (const [lr,mr] of [[4,5],[6,7]]) for (let c=0;c<4;c++) if(one(r[lr][c])) addSp({type:'Honey tree',location:one(r[lr][c]),phase:'Special tree',mons:lines(r[mr][c]),note:'Special honey tree'});
  const P=blocks(r[2][5]), Q=blocks(r[2][6]), Lc=blocks(r[2][7]);
  if(!(P.length===Q.length&&Q.length===Lc.length)) unparsed.push({sheet:'encounters-universal.csv',where:'statics',raw:`${P.length}/${Q.length}/${Lc.length}`,why:'column lengths differ'});
  P.forEach((p,i)=>{ const m=p.match(/^(.+?)\s*-\s*Lv\s*(\d+)/i); if(!m||!M(m[1])){unparsed.push({sheet:'encounters-universal.csv',where:'statics',raw:p,why:'no "Name - Lv N"'});return;}
    addSp({type:'Static',location:Lc[i]||'',mons:[m[1]],level:m[2],req:Q[i]||''}); });
  // Dept store: "31% Ekans 25" lines; non-Pokémon lines (items) kept as note
  const ds=lines(r[4][5]); const head=ds.filter(x=>!/^[.\d]+%/.test(x)).join(' ');
  const odds=ds.filter(x=>/^[.\d]+%/.test(x)).map(x=>{const m=x.match(/^([.\d]+%)\s+(.+?)(?:\s+(\d+))?\s*!?$/);return m&&{rate:m[1],what:m[2].trim(),lvl:m[3]||''}}).filter(Boolean);
  const dm=odds.filter(o=>M(o.what)), di=odds.filter(o=>!M(o.what));
  addSp({type:'Dept. Store',location:'Veilstone City',mons:dm.map(o=>o.what),odds:dm,req:head.replace(/:$/,''),note:di.length?'Also: '+di.map(o=>`${o.rate} ${o.what}`).join(', '):''});
  if(!one(r[3][6])===false && !lines(r[4][6]).length) unparsed.push({sheet:'encounters-universal.csv',where:'"Rock Smash" header (col G)',raw:'(empty)',why:'header with no data under it'});
}
// Route 201 starters: encounter sheet lists Chimchar/Piplup/Turtwig at Lv5 with no rate -> starter choice
{ const a=areas['route-201']; const g=(a?.enc.Grass||[]).filter(e=>!e.rate);
  if(g.length){ addSp({type:'Gift',location:'Route 201',name:'Starter (choose one)',level:g[0].lvl,mons:g.map(e=>e.mon),choice:true,note:'Listed in the encounter sheet with no encounter rate'});
    a.enc.Grass=a.enc.Grass.filter(e=>e.rate); if(!a.enc.Grass.length) delete a.enc.Grass;
    for (const e of g){ const m=M(e.mon); m.locations=m.locations.filter(l=>l.slug!=='route-201'); } } }
for (const s of special){ s.mons.forEach(x=>{const m=x.slug&&Object.values(mons).find(y=>y.slug===x.slug); if(m)(m.special??=[]).push(s.id);}); if(s.areaSlug)(areas[s.areaSlug].special??=[]).push(s.id); }

for (const a of Object.values(areas)) a.fights=[...new Set(a.trainers.map(id=>trainers[id].fight))];
for (const f of FIGHTS) f.areaSlug=trainers[f.members[0]].areaSlug;
// ---- Level caps (HoF rules, mechanics.md "## Level Caps": highest level on each gym leader's party)
const CAPS={}; { const sec=md('mechanics.md').split(/^## Level Caps\s*$/m).pop().split('________________')[0];
  for(const m of sec.matchAll(/^([A-Za-z#0-9 \/]+):\s*Lv\.\s*(\d+)/gm)) CAPS[clean(m[1])]=+m[2]; }
const splitCap={Roark:'Roark',Gardenia:'Gardenia',Fantina:'Fantina',Maylene:'Maylene',Wake:'Wake',Byron:'Byron',Candice:'Candice',Volkner:'Volkner',Galactic:'Coronet/E4','Elite Four':'Coronet/E4'};
for(const f of FIGHTS){ const t0=trainers[f.members[0]]; const k=splitCap[f.split]; if(k&&CAPS[k]!=null) f.cap={level:CAPS[k],label:`${k==='Coronet/E4'?'Coronet/E4':k+' split'} level cap`};
  const bm=t0.name.match(/^Barry #(\d)/); if(bm&&CAPS['Barry #'+bm[1]]!=null) f.cap={level:CAPS['Barry #'+bm[1]],label:`Barry #${bm[1]} level cap (this fight only)`}; }
for(const g of gyms){ const k=Object.keys(CAPS).find(c=>g.name.includes(c))||(/Elite Four/.test(g.name)?'Coronet/E4':null); if(k) g.cap=CAPS[k]; }
console.log('level caps',JSON.stringify(CAPS));
// ---- pChal (partial: 15 of 31 videos) — only from data/pchal-*.{csv,json,md}
const PCH={}; {
  const rows=f=>{ const r=csv(f).filter(x=>x.some(c=>clean(c))); const H=r[0].map(clean); return r.slice(1).map(x=>Object.fromEntries(H.map((h,i)=>[h,clean(x[i])]))); };
  const vids=JSON.parse(fs.readFileSync(path.join(REF,'data','pchal-videos.json'),'utf8')); const vById=Object.fromEntries(vids.map(v=>[v.id,v]));
  const processed=vids.filter(v=>v.processed).length;
  const vid=(url,ts)=>null; // video/timestamp links intentionally not published (Jack)
  const _vidUnused=(url,ts)=>{ if(!url) return null; const id=(url.match(/[?&]v=([\w-]+)/)||[])[1]; const label=(ts||'').replace(/^00:(?=\d\d:\d\d$)/,'').replace(/^0(?=\d:)/,'');
    return {url,ts,label:ts?`pChal video @ ${label}`:'pChal video',title:vById[id]?.title||'',id}; };
  // mon-name linkifier (longest names first, whole words)
  const names=Object.values(mons).map(m=>({n:m.name,slug:m.slug})).filter(x=>x.n.length>2).sort((a,b)=>b.n.length-a.n.length);
  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const RX=new RegExp('(?<![A-Za-z])('+names.map(x=>esc(x.n)).join('|')+')(?![A-Za-z])','g'); const bySN=Object.fromEntries(names.map(x=>[x.n,x.slug]));
  const linkify=t=>{ if(!t) return []; const out=[]; let last=0; for(const m of t.matchAll(RX)){ if(m.index>last) out.push({t:t.slice(last,m.index)}); out.push({t:m[1],slug:bySN[m[1]]}); last=m.index+m[1].length; } if(last<t.length) out.push({t:t.slice(last)}); return out; };
  const areaList=order.map(s=>areas[s]); const aIdx=Object.fromEntries(order.map((s,i)=>[s,i]));
  const unmatched={routing:[],matchups:[],names:[]};
  // route -> areas: full area names, "Route NNN" (exact, else all its halves), or a single-word town/city prefix only when unique
  const matchAreas=r=>{ const hits=new Set(); let rest=r;
    for(const a of [...areaList].sort((x,y)=>y.name.length-x.name.length)){ const re=new RegExp('(?<![\\w])'+esc(a.name)+'(?![\\w])','i'); if(re.test(rest)){ hits.add(a.slug); rest=rest.replace(re,' '); } }
    for(const m of rest.matchAll(/Route (\d{3})(?!\d)/g)){ const ex=areas[slug('Route '+m[1])]; if(ex) hits.add(ex.slug); else areaList.filter(a=>a.name.startsWith('Route '+m[1]+' ')).forEach(a=>hits.add(a.slug)); }
    for(const w of rest.replace(/Route \d{3}/g,' ').match(/\b[A-Z][a-z]{3,}\b/g)||[]){ const c=areaList.filter(a=>a.name.split(' ')[0]===w); if(c.length===1&&/ (City|Town)$/.test(c[0].name)) hits.add(c[0].slug); }
    return [...hits].sort((x,y)=>aIdx[x]-aIdx[y]); };
  PCH.routing=rows('pchal-encounter-routing.csv').map((r,i)=>{ const as=matchAreas(r.route); if(!as.length) unmatched.routing.push(r.route);
    return {id:i,route:r.route,areas:as,priority:r.priority?num(r.priority):null,target:linkify(r.target_mon),targetRaw:r.target_mon,method:r.method,hold:r.hold_condition,repel:r.repel_manip,notes:linkify(r.notes),video:vid(r.video_url,r.timestamp)}; });
  const first=r=>r.areas.length?Math.min(...r.areas.map(s=>aIdx[s])):1e9;
  PCH.routing.sort((a,b)=>first(a)-first(b)||(a.priority??99)-(b.priority??99)||a.id-b.id);
  for(const r of PCH.routing) for(const s of r.areas) (areas[s].pchal??=[]).push(r.id);
  // inline marks: encounter rows whose species is a target of a priority/routing row for that area
  for(const r of PCH.routing){ const ts=new Set(r.target.filter(x=>x.slug).map(x=>x.slug)); r.marked=[];
    for(const s of r.areas) for(const [meth,list] of Object.entries(areas[s].enc)) for(const e of list) if(e.slug&&ts.has(e.slug)){ (e.prio??=[]).includes(r.id)||e.prio.push(r.id); r.marked.push(s+':'+meth); } }
  // matchups -> fights: trainer keyword + (gym location) + opponent species on the team; rows in a (trainer,location) group share the best-matching fight(s)
  const baseSp=l=>key(clean(l.replace(/Lv\.?\s*\d+/i,'').replace(/[♂♀]/g,'')).split(/[-\s(]/)[0]);
  const teamSp=f=>new Set(f.members.flatMap(id=>trainers[id].team.map(m=>baseSp(m.label))));
  const oppSp=o=>{ const m=clean(o.replace(/\(.*?\)/g,'')); return m&&M(m)?key(M(m).name).replace(/[^a-z0-9]/g,''):null; };
  const kw=t=>/clown/i.test(t)?'Clown':/gym trainer|grunt/i.test(t)?'':t.split(' ')[0];
  const mrows=rows('pchal-matchups.csv').map((r,i)=>({id:i,trainer:r.trainer,location:r.location,opp:r.opp_mon,oppLevel:r.opp_level,oppMoves:r.opp_moves_items,answer:linkify(r.answer_mon),why:linkify(r.why),avoid:linkify(r.avoid),confidence:(r.confidence||'').toLowerCase()||'unrated',video:vid(r.video_url,r.timestamp),sp:oppSp(r.opp_mon)}));
  // Explicit override list (applied only if the source row still has the old value; no-op once the source is fixed).
  // Mars Gible -> Gabite (per Jack) is now fixed in the source CSV itself (pass 2), so the list is empty.
  const MATCHUP_OPP_FIX=[];
  for (const fx of MATCHUP_OPP_FIX){ const r=mrows.find(r=>r.trainer===fx.trainer&&r.location===fx.location&&r.opp===fx.from); if(!r){ console.log('MATCHUP_OPP_FIX no longer needed:',fx.from); continue; }
    r.opp=fx.to; r.sp=oppSp(fx.to); r.oppNote=fx.note; }
  mrows.forEach(r=>{ const m=M(clean(r.opp.replace(/\(.*?\)/g,''))); r.oppLink=m?m.slug:null; });
  const groups={}; mrows.forEach(r=>(groups[r.trainer+'|'+r.location.split(' (')[0]]??=[]).push(r));
  const GYMAREA=l=>{ const m=l.match(/^(\w+) Gym/); return m?m[1]:null; };
  for(const [g,rs] of Object.entries(groups)){ const r0=rs[0]; const k=kw(r0.trainer), ga=GYMAREA(r0.location), loc=r0.location.split(' (')[0];
    const exactF=FIGHTS.filter(f=>f.members.some(id=>trainers[id].name===r0.trainer));
    let cand=exactF.length?exactF:FIGHTS.filter(f=>(!k||f.members.some(id=>trainers[id].name.includes(k)))&&(!ga||f.area.startsWith(ga+' Gym'))&&(ga||!areas[slug(loc)]||f.areaSlug===slug(loc)||!FIGHTS.some(x=>x.areaSlug===slug(loc)&&x.members.some(id=>trainers[id].name.includes(k)))));
    if(!k&&!exactF.length){ // generic trainers (gym trainers, tag grunts): match each row on its own by species within the location
      const pool=cand.filter(f=>ga||f.areaSlug===slug(loc));
      for(const r of rs){ const bf=r.sp?pool.filter(f=>teamSp(f).has(r.sp)):[]; r.fights=bf.map(f=>f.id); r.onTeam=bf.length?true:null;
        if(!bf.length) unmatched.matchups.push(`${r.trainer} @ ${r.location}: ${r.opp} (no fight matched)`);
        for(const fid of r.fights) (FIGHTS[fid].pchal??=[]).push(r.id); }
      continue; }
    const sc=f=>{ const ts=teamSp(f); return rs.filter(r=>r.sp&&ts.has(r.sp)).length; };
    const best=Math.max(0,...cand.map(sc)); const bf=best>0?cand.filter(f=>sc(f)===best):[];
    for(const r of rs){ r.fights=bf.map(f=>f.id); r.onTeam=r.sp?bf.every(f=>teamSp(f).has(r.sp)):null;
      if(!bf.length) unmatched.matchups.push(`${r.trainer} @ ${r.location}: ${r.opp} (no fight matched)`);
      else if(r.sp===null) unmatched.names.push(`${r.trainer}: opponent "${r.opp}" is not a species name; attached to the group's fight`);
      else if(!r.onTeam) unmatched.names.push(`${r.trainer}: ${r.opp} is not on the matched team in the trainer sheet`);
      for(const fid of r.fights) (FIGHTS[fid].pchal??=[]).push(r.id); } }
  // when a row matched several fights and gives a level, keep only fights where that species has that level (if any do)
  const lvOf=(fid,sp)=>FIGHTS[fid].members.flatMap(id=>trainers[id].team.filter(m=>baseSp(m.label)===sp).map(m=>num((m.label.match(/Lv\.?\s*(\d+)/i)||[])[1])));
  for(const r of mrows){ const L=num(r.oppLevel); if(L==null||!r.sp||r.fights.length<2) continue; const keep=r.fights.filter(fid=>lvOf(fid,r.sp).includes(L));
    if(keep.length&&keep.length<r.fights.length){ for(const fid of r.fights) if(!keep.includes(fid)) FIGHTS[fid].pchal=FIGHTS[fid].pchal.filter(x=>x!==r.id); r.fights=keep; } }
  for(const f of FIGHTS) if(f.pchal&&!f.pchal.length) delete f.pchal;
  // opponent level vs trainer sheet level (same species on the matched team)
  const conflicts=[];
  for(const r of mrows){ r.oppLevelN=num(r.oppLevel); if(r.oppLevelN==null||!r.sp||!r.fights.length) continue;
    const lv=[...new Set(r.fights.flatMap(fid=>FIGHTS[fid].members.flatMap(id=>trainers[id].team.filter(m=>baseSp(m.label)===r.sp).map(m=>num((m.label.match(/Lv\.?\s*(\d+)/i)||[])[1])))).filter(x=>x!=null))];
    if(lv.length&&!lv.includes(r.oppLevelN)){ r.sheetLevels=lv; conflicts.push(`${r.trainer}: ${r.opp} Lv${r.oppLevel} (sheet: Lv${lv.join('/')})`); } }
  unmatched.levelConflicts=conflicts;
  // Optional level pacing file (pchal-level-pacing.csv). Absent -> nothing rendered.
  PCH.pacing=[]; const pacingFile=path.join(REF,'data','pchal-level-pacing.csv');
  if(fs.existsSync(pacingFile)){ for(const [i,r] of rows('pchal-level-pacing.csv').entries()){
      const o={id:i,kind:(r.kind||'').toLowerCase(),name:r.name,location:r.location,min:num(r.rec_level_min),max:num(r.rec_level_max),basis:r.basis,confidence:(r.confidence||'').toLowerCase()||'unrated',source:clean(r.source||'').replace(/https?:\S+/g,'').trim(),fights:[],areas:[]};
      if(o.kind==='route'){ o.areas=matchAreas(r.name); if(!o.areas.length&&r.location) o.areas=matchAreas(r.location); }
      else if(o.kind==='trainer'){ const nk=key(r.name); const lk=r.location&&slug(r.location); let bm;
        if((bm=r.name.match(/^Barry #(\d+) \(all starter variants\)/i))) o.fights=FIGHTS.filter(f=>f.members.some(id=>new RegExp('^Barry #'+bm[1]+'\\b').test(trainers[id].name))).map(f=>f.id);
        else if(/^Elite Four \/ Mt\. Coronet$/i.test(r.name)) o.fights=FIGHTS.filter(f=>f.split==='Galactic'||f.split==='Elite Four').map(f=>f.id);
        else { let exact=FIGHTS.filter(f=>f.members.some(id=>trainers[id].name===r.name)); if(exact.length>1&&r.location){ const ex2=exact.filter(f=>key(f.area)===key(r.location)||f.areaSlug===slug(r.location.replace(/\*/g,''))); if(ex2.length) exact=ex2; } 
          o.fights=(exact.length?exact:FIGHTS.filter(f=>(key(f.title).includes(nk)||f.members.some(id=>key(trainers[id].name).includes(nk)))&&(!lk||f.areaSlug===lk||key(f.area).includes(key(r.location))))).map(f=>f.id); } }
      // official caps duplicated in this file: don't render, just check against mechanics.md caps
      o.isCap=/^level cap$/i.test(clean(r.basis));
      if(o.isCap){ const bad=o.fights.filter(fid=>!FIGHTS[fid].cap||FIGHTS[fid].cap.level!==o.max); if(!o.fights.length||bad.length) unmatched.capMismatch=(unmatched.capMismatch||[]).concat(`${r.name}: file ${o.max}, site caps ${[...new Set(bad.map(fid=>FIGHTS[fid].cap?.level))].join('/')} on ${bad.length}/${o.fights.length} fights`); }
      else { for(const s of o.areas) (areas[s].pacing??=[]).push(i); for(const fid of o.fights) (FIGHTS[fid].pacing??=[]).push(i); }
      if(!o.areas.length&&!o.fights.length) unmatched.pacing=(unmatched.pacing||[]).concat(`${r.kind} ${r.name} @ ${r.location}`);
      PCH.pacing.push(o); } }
  // fights without a direct pacing row inherit their area's route range (marked as inherited)
  { let direct=0,inh=0,capOnly=0,none=0; for(const f of FIGHTS){ const ap=areas[f.areaSlug]?.pacing; if(!f.pacing&&ap) f.pacingArea=ap;
      if(f.pacing) direct++; else if(f.pacingArea) inh++; else if(f.cap) capOnly++; else none++; }
    console.log('pacing coverage: direct',direct,'inherited',inh,'cap only',capOnly,'nothing',none,'of',FIGHTS.length); }
  PCH.matchups=mrows; PCH.groups=Object.entries(groups).map(([g,rs])=>({trainer:rs[0].trainer,location:rs[0].location,rows:rs.map(r=>r.id),fights:rs[0].fights,slug:slug(g)}));
  PCH.meta={processed,total:vids.length};
  PCH.unmatched=unmatched;
  console.log('pchal routing',PCH.routing.length,'matchups',mrows.length,'unmatched',JSON.stringify(unmatched));
}
// ---- Search index
const idx=[];
Object.values(mons).forEach(m=>idx.push({t:'Mon',n:m.name,u:`mon/${m.slug}/`,d:m.types.join('/')}));
order.forEach(s=>{const a=areas[s]; idx.push({t:'Route',n:a.name,u:`route/${a.slug}/`,d:`${Object.values(a.enc).flat().length} enc · ${a.fights.length} trainer fights · ${a.items.length} items`});});
FIGHTS.forEach(f=>idx.push({t:'Trainer',n:f.title,u:`trainer/${f.slug}/`,d:`${f.area} · ${f.split} split`+(f.kind==='multi'?' · '+f.members.map(id=>trainers[id].name).join(' / '):'')}));
const seenI=new Set(); itemsU.forEach(i=>{ if(seenI.has(key(i.name)))return; seenI.add(key(i.name)); idx.push({t:i.category==='TM'||i.category==='HM'?'TM':'Item',n:i.name,u:`items/?q=${encodeURIComponent(i.name)}`,d:i.move?`${i.move.type??''} ${i.move.cat??''}`.trim():i.category}); });
special.forEach(sp=>idx.push({t:'Special',n:`${sp.mons.map(m=>m.name).join(', ')||sp.name||sp.type}`,u:`special-encounters/?q=${encodeURIComponent(sp.type)}#sp-${sp.id}`,d:`${sp.type}${sp.location?' · '+sp.location:''}${sp.phase?' · '+sp.phase:''}`}));
order.forEach(s=>{const a=areas[s]; const ne=Object.values(a.enc).flat().length+(a.special||[]).length; if(ne) idx.push({t:'Encounters',n:a.name+' encounters',u:`encounters/${a.slug}/`,d:`${ne} wild/special`}); if(a.fights.length) idx.push({t:'Trainer',n:a.name+' trainers',u:`trainers/${a.slug}/`,d:`${a.fights.length} fights`});});
idx.push({t:'Encounters',n:'Encounter routing tips & tricks',u:'encounters/routing-tips/',d:'General rules, hold checklist, repel routing, priority by route (pChal, partial)'});
idx.push({t:'Encounters',n:'Hold checklist (when to save an encounter)',u:'encounters/routing-tips/#hold',d:'pChal, partial'});
order.forEach(s=>{const a=areas[s]; if(a.pchal) idx.push({t:'Encounters',n:a.name+' priority encounters',u:`encounters/${a.slug}/#priority`,d:`${a.pchal.length} routing notes (pChal)`});});
gyms.forEach(g=>idx.push({t:'Gym',n:g.name,u:`gym/${g.slug}/`,d:`${g.fights.length} boss fights`}));

write('mons',Object.values(mons).sort((a,b)=>a.id-b.id)); write('areas',order.map(s=>areas[s])); write('trainers',trainers); write('fights',FIGHTS); write('pchal',PCH);
write('items',itemsU); write('gyms',gyms); write('special',special); write('unparsed',unparsed); write('gymExtras',gymExtras); write('typechart',{types,chart,notes:typeNotes});
fs.mkdirSync(new URL('../public/',import.meta.url).pathname,{recursive:true});
fs.writeFileSync(new URL('../public/search-index.json',import.meta.url).pathname,JSON.stringify(idx));
const ct={};special.forEach(x=>ct[x.type]=(ct[x.type]||0)+1);console.log('special',JSON.stringify(ct),'unparsed',JSON.stringify(unparsed));
console.log('mons',Object.keys(mons).length,'areas',order.length,'trainers',trainers.length,'items',itemsU.length,'gyms',gyms.map(g=>g.name+':'+g.fights.length).join(','),'index',idx.length);
