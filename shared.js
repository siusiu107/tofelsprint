/* shared.js - 공용 유틸 + 데이터 로더 (v3.1) */
(function(){

// --- Safety patch: prevent "String.prototype.matchAll called with a non-global RegExp" ---
try{
  if(typeof String.prototype.matchAll === 'function' && !String.prototype.__toefl_matchAll_patched){
    const origMatchAll = String.prototype.matchAll;
    Object.defineProperty(String.prototype, '__toefl_matchAll_patched', {value:true});
    String.prototype.matchAll = function(regexp){
      try{
        if(regexp instanceof RegExp){
          if(!regexp.global){
            // clone as global
            regexp = new RegExp(regexp.source, regexp.flags + 'g');
          }
        }
      }catch(e){}
      return origMatchAll.call(this, regexp);
    };
  }
}catch(e){}

// --- tiny helpers ---
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = (n) => (n<10?'0':'')+n;

function nowMs(){ return Date.now(); }

function formatTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec/60);
  const s = sec%60;
  return `${m}:${pad2(s)}`;
}

function toast(msg, ms=2200){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id='toast';
    t.style.cssText = `
      position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
      background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:10px;
      font-size:14px;z-index:99999;max-width:90vw;text-align:center;
      box-shadow:0 8px 18px rgba(0,0,0,.25);`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t.__hide);
  t.__hide = setTimeout(()=>{ t.style.opacity='0'; }, ms);
}

function escapeHtml(s){
  return (s??'').toString()
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

// --- storage (practice: no localStorage usage by convention; sim: localStorage allowed) ---
const storage = {
  get(key, def=null){
    try{
      const v = localStorage.getItem(key);
      if(v==null) return def;
      return JSON.parse(v);
    }catch(e){ return def; }
  },
  set(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  },
  del(key){
    try{ localStorage.removeItem(key); }catch(e){}
  }
};

const sessionStore = {
  get(key, def=null){
    try{
      const v = sessionStorage.getItem(key);
      if(v==null) return def;
      return JSON.parse(v);
    }catch(e){ return def; }
  },
  set(key, val){
    try{ sessionStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  },
  del(key){
    try{ sessionStorage.removeItem(key); }catch(e){}
  }
};

// --- fetch helpers ---
async function fetchText(url){
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
}
async function fetchJson(url){
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}
async function exists(url){
  try{
    const r = await fetch(url, {method:'HEAD', cache:'no-store'});
    return r.ok;
  }catch(e){
    return false;
  }
}

// --- File name helpers ---
function normalizePath(p){
  return (p||'').replaceAll('\\','/').replace(/\/+/g,'/').replace(/^.\//,'');
}

function isProbablyReadingTxt(name){
  name = (name||'').toLowerCase();
  return name.endsWith('.txt') && name.includes('toefl') && name.includes('reading');
}

function isProbablyListeningSetFolder(name){
  return /^Listening_Set_\d{3}$/i.test((name||'').trim());
}

// --- Reading loader (auto-scan from data/reading, supports index.json or directory listing) ---
async function loadReadingIndex(){
  // Strategy:
  // 1) If data/reading/index.json exists -> use it
  // 2) else try directory listing parse (works in simple servers)
  // 3) else fallback to brute force TOEFL_Reading_0001..9999 (stop on first long miss)
  const base = '/data/reading/';
  // 1) index.json
  try{
    if(await exists(base+'index.json')){
      const idx = await fetchJson(base+'index.json');
      // idx can be array of filenames or objects
      let files = [];
      if(Array.isArray(idx)){
        files = idx.map(x => typeof x==='string'? x : x.file || x.path || '').filter(Boolean);
      }else if(idx && Array.isArray(idx.files)){
        files = idx.files.map(x => typeof x==='string'? x : x.file || x.path || '').filter(Boolean);
      }
      files = files.map(normalizePath).map(f => f.startsWith('data/reading/')? f.replace(/^data\/reading\//,'') : f);
      const unique = Array.from(new Set(files)).filter(f=>f.toLowerCase().endsWith('.txt'));
      return unique.map(f=>({file:f, title:f.replace(/\.txt$/i,'')})).sort((a,b)=>a.file.localeCompare(b.file));
    }
  }catch(e){}

  // 2) directory listing (Apache/python http.server shows <a href="...">)
  try{
    const html = await fetchText(base);
    const links = Array.from(html.matchAll(/href="([^"]+)"/g)).map(m=>m[1]);
    const files = links
      .filter(h => h && h.endsWith('.txt'))
      .map(h => decodeURIComponent(h))
      .filter(isProbablyReadingTxt)
      .map(normalizePath);
    const unique = Array.from(new Set(files));
    if(unique.length){
      return unique.map(f=>({file:f, title:f.replace(/\.txt$/i,'')})).sort((a,b)=>a.file.localeCompare(b.file));
    }
  }catch(e){}

  // 3) brute force
  const list = [];
  let miss=0;
  for(let i=1;i<=5000;i++){
    const fn = `TOEFL_Reading_${String(i).padStart(4,'0')}.txt`;
    const ok = await exists(base+fn);
    if(ok){
      list.push({file:fn, title:fn.replace(/\.txt$/i,'')});
      miss=0;
    }else{
      miss++;
      if(miss>40 && list.length>20) break;
    }
  }
  return list;
}

async function loadReadingPassage(file){
  const url = '/data/reading/' + normalizePath(file);
  const text = await fetchText(url);
  return parseReadingTxt(text, file);
}

function parseReadingTxt(raw, fileName=''){
  // This parser is compatible with earlier generator format:
  // - Title line
  // - Passage text paragraphs
  // - Questions numbered
  // - Answer key at bottom
  const lines = raw.replace(/\r\n/g,'\n').split('\n');
  let title = (lines[0]||'').trim();
  if(!title || title.length<3) title = fileName || 'Reading';
  let i=0;

  // skip initial empties
  while(i<lines.length && !lines[i].trim()) i++;
  // title as first non-empty
  title = (lines[i]||title).trim();
  i++;

  // gather until we hit a question pattern "1." or "1)" etc
  const passageLines = [];
  const qStartRe = /^\s*(\d{1,2})\s*[\.\)]\s+/;
  while(i<lines.length){
    const l = lines[i];
    if(qStartRe.test(l)) break;
    passageLines.push(l);
    i++;
  }
  const passageText = passageLines.join('\n').trim();

  // parse questions
  const questions = [];
  while(i<lines.length){
    const m = lines[i].match(qStartRe);
    if(!m){ i++; continue; }
    const qNum = parseInt(m[1],10);
    const stem = lines[i].replace(qStartRe,'').trim();
    i++;

    // collect choice lines (A) ... or A. ... etc) until next question or answer key
    const choices = [];
    const choiceRe = /^\s*([A-D])\s*[\)\.\:]\s*(.+)\s*$/i;
    while(i<lines.length){
      const l = lines[i];
      if(qStartRe.test(l)) break;
      if(/^\s*Answer\s*Key\b/i.test(l)) break;
      const cm = l.match(choiceRe);
      if(cm){
        choices.push({key:cm[1].toUpperCase(), text:cm[2].trim()});
      }else{
        // some formats wrap choices on next line; append to last choice if exists
        if(choices.length && l.trim()){
          choices[choices.length-1].text += ' ' + l.trim();
        }
      }
      i++;
    }
    questions.push({
      id: `${fileName||'R'}_Q${qNum}`,
      num: qNum,
      stem,
      choices
    });
  }

  // answer key: try to locate with regex over entire raw
  const answers = {};
  // common formats: "1. B" , "1:B", "1)B"
  const ansRe = /(^|\n)\s*(\d{1,2})\s*[\.\)\:]\s*([A-D])\b/g;
  let mm;
  while((mm = ansRe.exec(raw))!==null){
    answers[parseInt(mm[2],10)] = mm[3].toUpperCase();
  }

  // attach correct
  for(const q of questions){
    q.correct = answers[q.num] || null;
  }

  return {title, file:fileName, passageText, questions};
}

// --- Listening loader (path fix: /data/listening/Listening_Set_001/answer_key.txt) ---
async function loadListeningIndex(){
  // Strategy:
  // 1) Try to list /data/listening/ and find Listening_Set_### folders by HTML listing
  // 2) Fallback: brute force Listening_Set_001..999 by checking answer_key.txt
  // 3) If zip has wrapper folder, try one-level wrapper detection by probing common wrappers
  const base = '/data/listening/';

  // 1) directory listing
  try{
    const html = await fetchText(base);
    const links = Array.from(html.matchAll(/href="([^"]+)"/g)).map(m=>m[1]);
    const folders = links
      .map(h=>decodeURIComponent(h))
      .map(h=>h.replace(/\/$/,''))
      .filter(isProbablyListeningSetFolder)
      .map(normalizePath);
    if(folders.length){
      return folders
        .map(f=>({folder:f, title:f}))
        .sort((a,b)=>a.folder.localeCompare(b.folder));
    }
  }catch(e){}

  // 2) brute force direct
  const direct = [];
  let miss=0;
  for(let i=1;i<=999;i++){
    const f = `Listening_Set_${String(i).padStart(3,'0')}`;
    const ok = await exists(`${base}${f}/answer_key.txt`);
    if(ok){
      direct.push({folder:f, title:f});
      miss=0;
    }else{
      miss++;
      if(miss>40 && direct.length>10) break;
    }
  }
  if(direct.length) return direct;

  // 3) wrapper folder detection (one-level)
  // If someone extracted zip with a top folder, listing might show that folder but not sets.
  // We'll probe a few common wrapper names by looking for Listening_Set_001 inside them.
  const wrapperCandidates = [
    'TOEFL_Listening_Pack_v6_6_QOnly_NoChoices',
    'TOEFL_Listening_Pack',
    'listening',
    'Listening',
    'TOFEL기출-listening'
  ];
  for(const w of wrapperCandidates){
    const ok = await exists(`${base}${w}/Listening_Set_001/answer_key.txt`);
    if(ok){
      // list via brute force under wrapper
      const res=[];
      for(let i=1;i<=999;i++){
        const f = `Listening_Set_${String(i).padStart(3,'0')}`;
        const ok2 = await exists(`${base}${w}/${f}/answer_key.txt`);
        if(ok2) res.push({folder:`${w}/${f}`, title:f});
      }
      if(res.length) return res;
    }
  }

  return [];
}

async function loadListeningSet(folder){
  // folder can be "Listening_Set_001" or "wrapper/Listening_Set_001"
  const base = '/data/listening/' + normalizePath(folder).replace(/\/$/,'') + '/';

  // required: answer_key.txt (as you requested)
  const answerKeyTxt = await fetchText(base + 'answer_key.txt');

  // optional: metadata.json, questions.txt
  let metadata = null, questionsTxt = null;
  try{ if(await exists(base+'metadata.json')) metadata = await fetchJson(base+'metadata.json'); }catch(e){}
  try{ if(await exists(base+'questions.txt')) questionsTxt = await fetchText(base+'questions.txt'); }catch(e){}

  // audio: listening.mp3 required; question audios optional
  const listeningAudio = base + 'listening.mp3';
  const hasListening = await exists(listeningAudio);
  if(!hasListening){
    throw new Error(`listening.mp3 not found in ${base}`);
  }

  // parse questions
  const q = parseListeningQuestions(questionsTxt, metadata, folder);

  // parse answers from answer_key.txt
  const answers = parseAnswerKey(answerKeyTxt);
  for(const item of q){
    item.correct = answers[item.num] || null;
  }

  // question audio URLs
  for(const item of q){
    const n = String(item.num).padStart(2,'0');
    item.audioUrl = base + `questions_q${n}.mp3`;
  }

  return {
    folder,
    base,
    metadata,
    listeningAudio,
    questions: q
  };
}

function parseAnswerKey(txt){
  const m = {};
  if(!txt) return m;
  // supports "1 B", "1. B", "1:B"
  const re = /(^|\n)\s*(\d{1,2})\s*[\.\:\)]?\s*([A-D])\b/gi;
  let mm;
  while((mm = re.exec(txt))!==null){
    m[parseInt(mm[2],10)] = mm[3].toUpperCase();
  }
  return m;
}

function parseListeningQuestions(questionsTxt, metadata, folder){
  // Prefer metadata if it has questions array
  if(metadata && Array.isArray(metadata.questions) && metadata.questions.length){
    return metadata.questions.map((qq, idx)=>({
      id: `${folder}_Q${idx+1}`,
      num: idx+1,
      stem: (qq.stem||qq.question||'').trim(),
      choices: (qq.choices||qq.options||[]).map((c,i)=>({
        key: String.fromCharCode(65+i),
        text: typeof c==='string'? c : (c.text||'')
      }))
    }));
  }

  // Fallback: parse questions.txt
  const out = [];
  if(!questionsTxt) return out;
  const lines = questionsTxt.replace(/\r\n/g,'\n').split('\n');
  const qStart = /^\s*(\d{1,2})\s*[\.\)]\s*(.+)\s*$/;
  const choiceRe = /^\s*([A-D])\s*[\)\.\:]\s*(.+)\s*$/i;
  let i=0;
  while(i<lines.length){
    const m = lines[i].match(qStart);
    if(!m){ i++; continue; }
    const num = parseInt(m[1],10);
    let stem = (m[2]||'').trim();
    i++;
    const choices=[];
    while(i<lines.length){
      const l = lines[i];
      if(qStart.test(l)) break;
      const cm = l.match(choiceRe);
      if(cm){
        choices.push({key:cm[1].toUpperCase(), text:cm[2].trim()});
      }else{
        if(choices.length && l.trim()){
          choices[choices.length-1].text += ' ' + l.trim();
        }else if(!choices.length && l.trim()){
          stem += ' ' + l.trim();
        }
      }
      i++;
    }
    out.push({id:`${folder}_Q${num}`, num, stem, choices});
  }
  return out;
}

// --- Simulation assembling (mix lecture+conversation) ---
function shuffle(arr, rng=Math.random){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(rng()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t>>>15), 1 | t);
    r ^= r + Math.imul(r ^ (r>>>7), 61 | r);
    return ((r ^ (r>>>14)) >>> 0) / 4294967296;
  };
}

async function buildSimListeningPicks(listIndex, opts={}){
  // listIndex: [{folder,title}] where folder like "Listening_Set_001"
  // We decide lecture vs conversation by reading metadata.type if possible
  // If metadata missing, use folder number heuristic (odd/ even won't work) -> treat unknown as lecture.
  const rng = mulberry32(opts.seed ?? (Date.now() & 0xffffffff));

  // classify by metadata if available (lightweight: try metadata.json head for few)
  const lectures=[];
  const convs=[];
  for(const it of listIndex){
    // Only probe a few fields; do not fetch huge
    const base = '/data/listening/' + normalizePath(it.folder).replace(/\/$/,'') + '/';
    let type = null;
    try{
      if(await exists(base+'metadata.json')){
        const md = await fetchJson(base+'metadata.json');
        type = (md.type||md.kind||md.category||'').toString().toLowerCase();
      }
    }catch(e){}
    const isConv = type && (type.includes('conv') || type.includes('conversation'));
    if(isConv) convs.push(it);
    else lectures.push(it);
  }

  // pick counts
  const lectureCount = opts.lectureCount ?? 3;
  const convCount = opts.convCount ?? 2;

  const pickL = shuffle(lectures, rng).slice(0, Math.min(lectureCount, lectures.length));
  const pickC = shuffle(convs, rng).slice(0, Math.min(convCount, convs.length));

  // if not enough convs, fill from lectures; if not enough lectures, fill from convs
  while(pickC.length < convCount && lectures.length){
    const cand = shuffle(lectures, rng).find(x=>!pickL.includes(x) && !pickC.includes(x));
    if(!cand) break;
    pickC.push(cand);
  }
  while(pickL.length < lectureCount && convs.length){
    const cand = shuffle(convs, rng).find(x=>!pickL.includes(x) && !pickC.includes(x));
    if(!cand) break;
    pickL.push(cand);
  }

  // mix order (as requested)
  const mixed = shuffle([...pickL, ...pickC], rng);
  return mixed;
}

// --- expose public API ---
window.TOEFL_SHARED = {
  $,$$,
  clamp,pad2,formatTime,toast,escapeHtml,
  storage,sessionStore,
  fetchText,fetchJson,exists,
  loadReadingIndex,loadReadingPassage,parseReadingTxt,
  loadListeningIndex,loadListeningSet,parseListeningQuestions,parseAnswerKey,
  shuffle,mulberry32,buildSimListeningPicks
};

})();
