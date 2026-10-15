// Build-time loader: reads ONLY the reference dir and emits src/data/*.json
import fs from 'node:fs'; import path from 'node:path'; import Papa from 'papaparse';
const REF = process.env.KAIZO_REF || '/home/box/agent-data/workflows/platinum-kaizo-guide/reference';
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
const baseArea=n=>clean(n.replace(/\(.*?\)/g,'').replace(/\*/g,'').replace(/ - Requires.*$/,'')); for (const t of trainers){ const a=areas[slug(baseArea(t.area))] ?? route(baseArea(t.area)); a.trainers.push(t.id); }

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

// ---- Search index
const idx=[];
Object.values(mons).forEach(m=>idx.push({t:'Mon',n:m.name,u:`mon/${m.slug}/`,d:m.types.join('/')}));
order.forEach(s=>{const a=areas[s]; idx.push({t:'Route',n:a.name,u:`route/${a.slug}/`,d:`${Object.values(a.enc).flat().length} enc · ${a.trainers.length} trainers · ${a.items.length} items`});});
trainers.forEach(t=>idx.push({t:'Trainer',n:t.name,u:`trainer/${t.slug}/`,d:`${t.area} · ${t.split} split`}));
const seenI=new Set(); itemsU.forEach(i=>{ if(seenI.has(key(i.name)))return; seenI.add(key(i.name)); idx.push({t:i.category==='TM'||i.category==='HM'?'TM':'Item',n:i.name,u:`items/?q=${encodeURIComponent(i.name)}`,d:i.move?`${i.move.type??''} ${i.move.cat??''}`.trim():i.category}); });
gyms.forEach(g=>idx.push({t:'Gym',n:g.name,u:`gym/${g.slug}/`,d:`${g.fights.length} boss fights`}));

write('mons',Object.values(mons).sort((a,b)=>a.id-b.id)); write('areas',order.map(s=>areas[s])); write('trainers',trainers);
write('items',itemsU); write('gyms',gyms); write('gymExtras',gymExtras); write('typechart',{types,chart,notes:typeNotes});
fs.mkdirSync(new URL('../public/',import.meta.url).pathname,{recursive:true});
fs.writeFileSync(new URL('../public/search-index.json',import.meta.url).pathname,JSON.stringify(idx));
console.log('mons',Object.keys(mons).length,'areas',order.length,'trainers',trainers.length,'items',itemsU.length,'gyms',gyms.map(g=>g.name+':'+g.fights.length).join(','),'index',idx.length);
