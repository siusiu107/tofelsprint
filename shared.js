
/* shared.js - 공용 유틸 + 데이터 로더 (v3.1) */
(function(){

// --- Safety patch: prevent "String.prototype.matchAll called with a non-global RegExp" ---
try{
  if(typeof String.prototype.matchAll === 'function' && !String.prototype.__toefl_matchAll_patched){
    const origMatchAll = String.prototype.matchAll;
    Object.defineProperty(String.prototype, '__toefl_matchAll_patched', {value:true});
    String.prototype.matchAll = function(re){
      if(re instanceof RegExp && !re.global){
        re = new RegExp(re.source, (re.flags.includes('g') ? re.flags : (re.flags + 'g')));
      }
      return origMatchAll.call(this, re);
    };
  }
}catch(e){}

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));


  // --- Cloudflare R2/Worker API 설정 ---
  const API_BASE = (window.TOEFL_API_BASE || '/api').replace(/\/$/, '');
  const USE_API = !!(window.TOEFL_FORCE_API_MODE || !(location.hostname === 'localhost' || location.hostname === '127.0.0.1'));

  let _apiSessionEnsured = false;
  async function ensureApiSession(){
    if(!USE_API) return;
    if(_apiSessionEnsured) return;
    try{
      await fetch(API_BASE + '/session/start', { method:'POST', credentials:'include', cache:'no-store' });
    }catch(e){}
    _apiSessionEnsured = true;
  }

  function fileUrl(key){
    // key 예: "reading/TOEFL_Reading_0001.txt" or "listening/.../listening.mp3"
    return API_BASE + '/file?key=' + encodeURIComponent(key);
  }

  async function apiFetch(url){
    await ensureApiSession();
    const res = await fetch(url, { credentials:'include', cache:'no-store' });
    return res;
  }

  async function apiFetchText(url){
    const res = await apiFetch(url);
    if(!res.ok) throw new Error('API error: ' + res.status);
    return await res.text();
  }

  async function apiFetchJson(url){
    const res = await apiFetch(url);
    if(!res.ok) throw new Error('API error: ' + res.status);
    return await res.json();
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function ensureGlobal(re){
    if(!(re instanceof RegExp)) return re;
    const flags = re.flags.includes('g') ? re.flags : (re.flags + 'g');
    return new RegExp(re.source, flags);
  }

  function fmtTime(sec){
    if(!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const m = String(Math.floor(sec/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return `${m}:${s}`;
  }

  function toast(msg, ms=1700){
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._tm);
    toast._tm = setTimeout(()=>t.classList.add('hidden'), ms);
  }

  async function fetchText(url){
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  }
  async function fetchJson(url){
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  }

  /* Reading: auto-discover from extracted txt pack (python http.server listing) */
  const READ_CACHE_KEY = 'toefl_reading_index_v1';
  const READ_ROOT_KEY  = 'toefl_reading_root_v1';

  let _readingIndex = null;

  async function listHrefs(path){
    try{
      const html = await fetchText(path.endsWith('/') ? path : (path + '/'));
      const re = ensureGlobal(/href="([^"]+)"/g);
      const out = [];
      let m;
      while((m = re.exec(html))){
        const href = m[1];
        if(!href || href === '../') continue;
        out.push(href);
      }
      return out;
    }catch(e){
      return [];
    }
  }

  async function detectReadingRoot(){
    const cached = sessionStorage.getItem(READ_ROOT_KEY);
    if(cached) return cached;

    async function hasReadingTxt(dir){
      const hrefs = await listHrefs(dir);
      return hrefs.some(h => /TOEFL_Reading_\d{4}\.txt$/i.test(h));
    }

    // 1) Directly under data/reading/
    if(await hasReadingTxt('data/reading/')){
      sessionStorage.setItem(READ_ROOT_KEY, 'data/reading');
      return 'data/reading';
    }

    // 2) One / two-level wrapper folders
    const lv1 = (await listHrefs('data/reading/')).filter(h=>h.endsWith('/')).map(h=>h.replace(/\/$/,''));
    for(const d1 of lv1){
      const p1 = `data/reading/${d1}`;
      if(await hasReadingTxt(p1 + '/')){
        sessionStorage.setItem(READ_ROOT_KEY, p1);
        return p1;
      }
      const lv2 = (await listHrefs(p1 + '/')).filter(h=>h.endsWith('/')).map(h=>h.replace(/\/$/,''));
      for(const d2 of lv2){
        const p2 = `${p1}/${d2}`;
        if(await hasReadingTxt(p2 + '/')){
          sessionStorage.setItem(READ_ROOT_KEY, p2);
          return p2;
        }
      }
    }
    return null;
  }

  async function buildReadingIndex(){
    const root = await detectReadingRoot();
    if(!root) throw new Error('Reading 데이터가 없어. TOFEL기출-reading.zip을 toefl-web/data/reading/ 안에 압축 해제해줘.');

    const hrefs = await listHrefs(root + '/');
    const files = hrefs.filter(h => /TOEFL_Reading_\d{4}\.txt$/i.test(h));
    if(!files.length) throw new Error('Reading txt 파일을 못 찾았어. data/reading/에 압축 해제됐는지 확인해줘.');

    // Build index with limited concurrency (title/wordCount parsing)
    const tasks = files
      .map(f => ({
        file: f,
        id: Number((f.match(/TOEFL_Reading_(\d{4})\.txt/i)||[])[1] || 0)
      }))
      .sort((a,b)=>a.id-b.id);

    const out = new Array(tasks.length);
    let cursor = 0;
    const CONC = 16;

    async function worker(){
      while(cursor < tasks.length){
        const i = cursor++;
        const t = tasks[i];
        try{
          const raw = await fetchText(`${root}/${t.file}`);
          const parsed = parseReadingTxt(raw);
          out[i] = {
            id: t.id || parsed.id || i+1,
            title: parsed.title || `Passage ${String(t.id).padStart(4,'0')}`,
            wordCount: parsed.wordCount || null,
            file: t.file,
            root
          };
        }catch(e){
          out[i] = {
            id: t.id || i+1,
            title: `Passage ${String(t.id).padStart(4,'0')}`,
            wordCount: null,
            file: t.file,
            root
          };
        }
      }
    }

    await Promise.all(Array.from({length: Math.min(CONC, tasks.length)}, ()=>worker()));
    return out;
  }

  async function getReadingIndex(){
    // Cloudflare API 모드: /api/reading/index 사용
    if(USE_API){
      if(_readingIndex) return _readingIndex;
      const cached = sessionStorage.getItem(READ_CACHE_KEY);
      if(cached){
        try{ _readingIndex = JSON.parse(cached); return _readingIndex; }catch(e){}
      }
      await ensureApiSession();
      try{
        _readingIndex = await apiFetchJson(API_BASE + '/reading/index');
        sessionStorage.setItem(READ_CACHE_KEY, JSON.stringify(_readingIndex));
        return _readingIndex;
      }catch(e){
        throw new Error('Reading 인덱스를 못 불러왔어. Cloudflare Worker/R2 설정을 확인해줘. (' + (e.message||String(e)) + ')');
      }
    }

    // 로컬(dev) 모드: 기존 data/reading 디렉토리 스캔 방식
    if(_readingIndex) return _readingIndex;
    const cached = sessionStorage.getItem(READ_CACHE_KEY);
    if(cached){
      try{ _readingIndex = JSON.parse(cached); return _readingIndex; }catch(e){}
    }
    _readingIndex = await buildReadingIndex();
    sessionStorage.setItem(READ_CACHE_KEY, JSON.stringify(_readingIndex));
    return _readingIndex;
  }

  async function loadReadingPassage  async function loadReadingPassage(file, rootOverride=null){
    if(USE_API){
      await ensureApiSession();
      try{
        const raw = await apiFetchText(fileUrl('reading/' + file));
        return parseReadingTxt(raw);
      }catch(e){
        throw new Error('Reading 지문 파일을 못 불러왔어. R2에 reading/ 아래로 업로드됐는지 확인해줘.');
      }
    }

    // 로컬(dev) 모드
    const root = rootOverride || (await detectReadingRoot()) || 'data/reading';
    try{
      const raw = await fetchText(`${root}/${file}`);
      return parseReadingTxt(raw);
    }catch(e){
      throw new Error('Reading 지문 파일을 못 찾았어. data/reading/ 아래에 txt가 있는지 확인해줘.');
    }
  }

  function parseReadingTxt  function parseReadingTxt(raw){
    const lines = raw.replace(/\r\n/g,'\n').split('\n');
    const header = lines[0] || '';
    const titleMatch = header.match(/^Passage\s+(\d+):\s*(.+)$/);
    const id = titleMatch ? Number(titleMatch[1]) : null;
    const title = titleMatch ? titleMatch[2].trim() : header.trim();

    const wordCountMatch = raw.match(/Approx\.\s*word count:\s*(\d+)/i);
    const wordCount = wordCountMatch ? Number(wordCountMatch[1]) : null;

    const qStart = lines.findIndex(l => l.trim().toLowerCase() === 'questions');
    const answerStart = lines.findIndex(l => l.trim().toLowerCase() === 'answer key');
    const passageLines = lines.slice(0, qStart === -1 ? lines.length : qStart);
    // remove header blocks
    const cleanedPassage = passageLines
      .filter(l => !/^=+$/.test(l.trim()))
      .filter(l => !/^\(Approx\./.test(l.trim()))
      .filter(l => !/^Passage\s+\d+:/.test(l.trim()))
      .join('\n')
      .trim();

    const qLines = (qStart !== -1 && answerStart !== -1 && answerStart > qStart) ? lines.slice(qStart+2, answerStart) : [];
    const aLines = (answerStart !== -1) ? lines.slice(answerStart) : [];

    const answers = {};
    for(const l of aLines){
      const m = l.match(/^(\d+)\s*:\s*([A-D])\b/);
      if(m) answers[Number(m[1])] = m[2];
    }

    const questions = [];
    let i=0;
    while(i < qLines.length){
      const line = qLines[i];
      const qm = line.match(/^(\d+)\.\s*\[([^\]]+)\]\s*(.*)$/);
      if(!qm){ i++; continue; }
      const qnum = Number(qm[1]);
      const qtype = qm[2].trim();
      let qtext = qm[3].trim();
      i++;

      // collect until next question starts
      const block = [];
      while(i < qLines.length && !qLines[i].match(/^\d+\.\s*\[[^\]]+\]/)){
        block.push(qLines[i]);
        i++;
      }

      // split prompt vs choices
      const promptLines = [qtext];
      const choices = [];
      let curChoice = null;

      const flushChoice = ()=>{
        if(curChoice){
          curChoice.text = curChoice.text.trim();
          choices.push(curChoice);
          curChoice = null;
        }
      };

      for(const bl of block){
        const opt = bl.match(/^\s*([A-D])\.\s*(.*)$/);
        if(opt){
          flushChoice();
          curChoice = {letter: opt[1], text: opt[2] || ''};
        } else {
          if(curChoice){
            // wrap continuation
            if(bl.trim()==='') continue;
            curChoice.text += (curChoice.text ? ' ' : '') + bl.trim();
          } else {
            promptLines.push(bl);
          }
        }
      }
      flushChoice();

      const prompt = promptLines.join('\n').trim();
      const correct = answers[qnum] || null;

      questions.push({num:qnum, type:qtype, prompt, choices, correct});
    }

    return {id, title, wordCount, passage: cleanedPassage, questions};
  }

/* Listening: auto-discover from extracted pack (python http.server listing) */
const LISTEN_CACHE_KEY = 'toefl_listening_index_v1';
const LISTEN_ROOT_KEY = 'toefl_listening_root_v1';

async function detectListeningRoot(){
  const cached = sessionStorage.getItem(LISTEN_ROOT_KEY);
  if(cached) return cached;

  async function exists(url){
    try{
      const res = await fetch(url, {cache:'no-store'});
      return !!(res && res.ok);
    }catch(e){
      return false;
    }
  }

  async function hasSet(path){
    try{
      const res = await fetch(`${path}/Listening_Set_001/metadata.json`, {cache:'no-store'});
      return !!(res && res.ok);
    }catch(e){
      return false;
    }
  }

  async function listDirs(path){
    try{
      const html = await fetchText(path.endsWith('/') ? path : (path + '/'));
      const re = ensureGlobal(/href="([^"]+\/)"/g);
      const out = [];
      let m;
      while((m = re.exec(html))){
        const href = m[1];
        if(!href || href === '../') continue;
        const name = href.replace(/\/$/,'');
        if(name && !out.includes(name)) out.push(name);
      }
      return out;
    }catch(e){
      return [];
    }
  }

  // 1) Directly extracted sets under data/listening/
  if(await hasSet('data/listening')){
    sessionStorage.setItem(LISTEN_ROOT_KEY, 'data/listening');
    return 'data/listening';
  }

  // 2) One-level folder under data/listening/
  const lv1 = await listDirs('data/listening/');
  for(const d1 of lv1){
    const p1 = `data/listening/${d1}`;
    if(await hasSet(p1)){
      sessionStorage.setItem(LISTEN_ROOT_KEY, p1);
      return p1;
    }

    // 3) Two-level nested (common when zip has a wrapper folder)
    const lv2 = await listDirs(p1 + '/');
    for(const d2 of lv2){
      const p2 = `${p1}/${d2}`;
      if(await hasSet(p2)){
        sessionStorage.setItem(LISTEN_ROOT_KEY, p2);
        return p2;
      }
    }
  }

  return null;
}


  async function buildListeningIndex(){
    const root = await detectListeningRoot();
    if(!root) throw new Error('Listening 팩을 data/listening/ 에 압축 해제해줘.');

    // get directory listing for root to find set folders
    const html = await fetchText(root + '/');
    const re = ensureGlobal(/Listening_Set_(\d{3})\//g);
    const ids = [];
    let m;
    while((m = re.exec(html))){
      ids.push(Number(m[1]));
    }
    ids.sort((a,b)=>a-b);

    const index = [];
    // fetch metadata for each set (cap to 300 for safety)
    const cap = Math.min(ids.length, 400);
    for(let i=0;i<cap;i++){
      const set = ids[i];
      const folder = `Listening_Set_${String(set).padStart(3,'0')}`;
      try{
        const meta = await fetchJson(`${root}/${folder}/metadata.json`);
        index.push({
          set,
          folder,
          path: `${root}/${folder}`,
          format: meta.format || 'unknown',
          category: meta.category || '',
          main_topic: meta.main_topic || meta.scenario || '',
          scenario: meta.scenario || '',
          v: meta.v || ''
        });
      }catch(e){
        // skip
      }
    }
    return index;
  }

  async function getListeningIndex(){
    if(USE_API){
      const cached = sessionStorage.getItem(LISTEN_CACHE_KEY);
      if(cached){
        try{ return JSON.parse(cached); }catch(e){}
      }
      await ensureApiSession();
      try{
        const idx = await apiFetchJson(API_BASE + '/listening/index');
        sessionStorage.setItem(LISTEN_CACHE_KEY, JSON.stringify(idx));
        return idx;
      }catch(e){
        throw new Error('Listening 인덱스를 못 불러왔어. Cloudflare Worker/R2 설정을 확인해줘. (' + (e.message||String(e)) + ')');
      }
    }

    const cached = sessionStorage.getItem(LISTEN_CACHE_KEY);
    if(cached){
      try{ return JSON.parse(cached); }catch(e){}
    }
    const idx = await buildListeningIndex();
    sessionStorage.setItem(LISTEN_CACHE_KEY, JSON.stringify(idx));
    return idx;
  }

  async function loadListeningSet  async function loadListeningSet(entry){
    const base = entry.path; // Cloudflare 모드에서는 R2 object prefix (예: listening/.../Listening_Set_001)
    if(USE_API){
      await ensureApiSession();
      const [qtxt, atxt] = await Promise.all([
        apiFetchText(fileUrl(`${base}/questions.txt`)),
        apiFetchText(fileUrl(`${base}/answer_key.txt`)).catch(()=> '')
      ]);
      const qs = parseListeningQuestions(qtxt);
      const ans = parseListeningAnswerKey(atxt);
      for(const q of qs){
        if(ans[q.num]){
          q.correct = ans[q.num].letter;
          q.explain = ans[q.num].explain;
        }
      }
      return {entry, questions: qs};
    }

    // 로컬(dev) 모드
    const [qtxt, atxt] = await Promise.all([
      fetchText(`${base}/questions.txt`),
      fetchText(`${base}/answer_key.txt`).catch(()=> '')
    ]);
    const qs = parseListeningQuestions(qtxt);
    const ans = parseListeningAnswerKey(atxt);
    for(const q of qs){
      if(ans[q.num]){
        q.correct = ans[q.num].letter;
        q.explain = ans[q.num].explain;
      }
    }
    return {entry, questions: qs};
  }

  function parseListeningQuestions  function parseListeningQuestions(txt){
    const lines = txt.replace(/\r\n/g,'\n').split('\n');
    const qs = [];
    let cur = null;
    let curChoice = null;

    const flushChoice = ()=>{
      if(curChoice){
        curChoice.text = curChoice.text.trim();
        cur.choices.push(curChoice);
        curChoice = null;
      }
    };
    const flushQ = ()=>{
      if(cur){
        flushChoice();
        cur.prompt = cur.prompt.trim();
        qs.push(cur);
        cur = null;
      }
    };

    for(const line of lines){
      const qm = line.match(/^Q(\d+)\.\s*\(([^\)]+)\)\s*(.*)$/);
      if(qm){
        flushQ();
        cur = { num:Number(qm[1]), type: qm[2].trim(), prompt: (qm[3]||'').trim(), choices: [], correct:null, explain:'' };
        continue;
      }
      if(!cur) continue;

      const opt = line.match(/^\s*([A-D])\.\s*(.*)$/);
      if(opt){
        flushChoice();
        curChoice = { letter: opt[1], text: (opt[2]||'').trim() };
        continue;
      }

      if(curChoice){
        if(line.trim()==='') continue;
        curChoice.text += ' ' + line.trim();
      } else {
        if(line.trim()==='') continue;
        cur.prompt += '\n' + line;
      }
    }
    flushQ();
    return qs;
  }

  function parseListeningAnswerKey(txt){
    const out = {};
    const lines = txt.replace(/\r\n/g,'\n').split('\n');
    for(const line of lines){
      const m = line.match(/^Q(\d+)\s*:\s*([A-D])\s*-\s*(.*)$/);
      if(m){
        out[Number(m[1])] = { letter: m[2], explain: (m[3]||'').trim() };
      }
    }
    return out;
  }

  function pickRandom(arr, n){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a.slice(0, Math.min(n, a.length));
  }


  // --- Audio guard (best-effort) ---
  // 브라우저/DevTools로 오디오 배속/구간이동 같은 임의조작을 "완전" 차단하긴 불가능하지만,
  // 일반적인 조작(배속, 시킹, 일시정지)을 최대한 막아두는 가드야.
  function secureAudio(audio, opts){
    opts = Object.assign({ blockSeek:true, blockRate:true, blockPause:false }, opts||{});
    if(!audio || audio.__toeflSecured) return audio;
    Object.defineProperty(audio, '__toeflSecured', { value:true });

    try{ audio.controls = false; }catch(e){}
    try{ audio.preload = 'auto'; }catch(e){}
    try{ if(opts.blockRate) audio.playbackRate = 1; }catch(e){}

    let lastSafe = 0;
    let internal = false;

    function setTime(t){
      internal = true;
      try{ audio.currentTime = t; }catch(e){}
      internal = false;
    }

    audio.addEventListener('timeupdate', ()=>{
      if(internal) return;
      if(audio.seeking) return;
      // 정상 재생 중이면 안전 시간 갱신
      lastSafe = audio.currentTime || 0;
    });

    if(opts.blockSeek){
      audio.addEventListener('seeking', ()=>{
        if(internal) return;
        const cur = audio.currentTime || 0;
        const diff = Math.abs(cur - lastSafe);
        // 자연스러운 드리프트는 허용
        if(diff > 0.6){
          setTime(lastSafe);
          toast('오디오 구간 이동은 막아뒀어');
        }
      });
    }

    if(opts.blockRate){
      audio.addEventListener('ratechange', ()=>{
        try{
          if(audio.playbackRate !== 1){
            audio.playbackRate = 1;
            toast('배속 변경은 막아뒀어');
          }
        }catch(e){}
      });
      audio.addEventListener('loadedmetadata', ()=>{
        try{ audio.playbackRate = 1; }catch(e){}
      });
    }

    if(opts.blockPause){
      audio.addEventListener('pause', ()=>{
        // ended 직전/직후 pause는 무시
        const dur = audio.duration || 0;
        const cur = audio.currentTime || 0;
        if(dur && (dur - cur) < 0.25) return;
        // 우리 코드에서 명시적으로 멈춘 경우는 허용
        if(audio.__toeflAllowPauseOnce){
          audio.__toeflAllowPauseOnce = false;
          return;
        }
        // 임의 일시정지 방지
        try{
          if(sectionIsListening()){ // sim.js/app.js에서 주입
            audio.play().catch(()=>{});
            toast('일시정지는 막아뒀어');
          }
        }catch(e){}
      });
    }

    return audio;
  }

  // sim.js/app.js에서 현재 섹션이 Listening인지 알려주기 위한 훅(없으면 true로 처리 안 함)
  let _sectionIsListening = null;
  function setSectionIsListening(fn){ _sectionIsListening = fn; }
  function sectionIsListening(){ return (typeof _sectionIsListening === 'function') ? !!_sectionIsListening() : false; }

  // --- Service Worker 등록: data 폴더 직접 URL 접근(네비게이션) 차단 ---
  try{
    if('serviceWorker' in navigator){
      window.addEventListener('load', ()=>{
        navigator.serviceWorker.register('sw.js').catch(()=>{});
      });
    }
  }catch(e){}

  window.TOEFL = {
    API_BASE, USE_API,

    $, $$, escapeHtml, ensureGlobal, fmtTime, toast,
    secureAudio, setSectionIsListening,
    fileUrl,
    getReadingIndex, loadReadingPassage,
    getListeningIndex, loadListeningSet, detectListeningRoot,
    pickRandom
  };
})();
