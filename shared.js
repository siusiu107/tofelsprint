/* shared.js - 공용 유틸 + 데이터 로더 (v3.1) */
(function(){

  // --- Safety patch: prevent "String.prototype.matchAll called with a non-global RegExp argument" ---
  function ensureGlobal(re){
    try{
      if(re instanceof RegExp && !re.global){
        return new RegExp(re.source, re.flags + 'g');
      }
    }catch(e){}
    return re;
  }

  // --- Small DOM helpers ---
  function $(sel, root=document){ return root.querySelector(sel); }
  function $$(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function escapeHtml(s){
    return (s??'').toString().replace(/[&<>"']/g, c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function fmtTime(sec){
    sec = Math.max(0, Math.floor(sec||0));
    const m = Math.floor(sec/60);
    const s = sec%60;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function toast(msg, ms=2200){
    let t = document.getElementById('toast');
    if(!t){
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = `
        position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
        background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:10px;
        font-size:14px;z-index:99999;max-width:90vw;text-align:center;
        box-shadow:0 8px 18px rgba(0,0,0,.25);opacity:0;transition:opacity .18s;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.__hide);
    t.__hide = setTimeout(()=>{ t.style.opacity='0'; }, ms);
  }


  // --- Loading overlay (대용량 데이터 로딩용) ---
  const __LONG_LOADING_TEXT = "많은 양의 데이터를 로딩하므로 시간이 오래 걸릴 수 있습니다. 오류가 아니니 여유를 가지고 기다려 주십시오. 양해해 주셔서 감사합니다.";
  let __loadingEl = null;
  let __loadingTitle = null;
  let __loadingSub = null;
  let __loadingLong = null;

  function __ensureLoadingEl(){
    if(__loadingEl) return __loadingEl;
    const el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.className = 'loading-overlay hidden';
    el.innerHTML = `
      <div class="loading-card">
        <div class="spinner" aria-hidden="true"></div>
        <div class="loading-texts">
          <div class="loading-title">로딩 중…</div>
          <div class="loading-sub"></div>
          <div class="loading-long hidden"></div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    __loadingEl = el;
    __loadingTitle = el.querySelector('.loading-title');
    __loadingSub = el.querySelector('.loading-sub');
    __loadingLong = el.querySelector('.loading-long');
    return el;
  }

  function showLoading(title='로딩 중…', subtitle=''){
    const el = __ensureLoadingEl();
    __loadingTitle.textContent = title || '로딩 중…';
    __loadingSub.textContent = subtitle || '';
    __loadingSub.classList.toggle('hidden', !subtitle);
    __loadingLong.textContent = '';
    __loadingLong.classList.add('hidden');
    el.classList.remove('hidden');
  }

  function showLoadingLongHint(text=__LONG_LOADING_TEXT){
    if(!__loadingEl) return;
    __loadingLong.textContent = text || __LONG_LOADING_TEXT;
    __loadingLong.classList.remove('hidden');
  }

  function hideLoading(){
    if(!__loadingEl) return;
    __loadingEl.classList.add('hidden');
  }

  async function withLoading(title, fn, subtitle=''){
    let done = false;
    let shown = false;
    const showTimer = setTimeout(()=>{
      shown = true;
      showLoading(title, subtitle);
    }, 150);
    const longTimer = setTimeout(()=>{
      if(!done){
        if(!shown){ shown = true; showLoading(title, subtitle); }
        showLoadingLongHint();
      }
    }, 5000);

    try{
      return await fn();
    } finally {
      done = true;
      clearTimeout(showTimer);
      clearTimeout(longTimer);
      if(shown) hideLoading();
    }
  }

  // --- Fetch helpers ---
  async function existsUrl(url){
    // Prefer HEAD to avoid downloading large files, fallback to GET if HEAD is blocked.
    try{
      let res = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(res.ok) return true;
      if(res.status === 405 || res.status === 403){
        res = await fetch(url, { method:'GET', cache:'no-store' });
        return res.ok;
      }
      return false;
    }catch(e){
      try{
        const res = await fetch(url, { method:'GET', cache:'no-store' });
        return res.ok;
      }catch(e2){
        return false;
      }
    }
  }

  async function fetchText(url){
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  async function fetchJson(url){
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // --- Audio hardening ---
  function secureAudio(audio){
    if(!audio) return;
    try{
      audio.controls = false;
      audio.disableRemotePlayback = true;
      audio.preload = 'auto';
      // Try to reduce tampering
      audio.addEventListener('ratechange', ()=>{
        if(audio.playbackRate !== 1) audio.playbackRate = 1;
      });
      audio.addEventListener('seeking', ()=>{
        // block manual seeking during listening section
        if(sectionIsListening()){
          try{ audio.currentTime = Math.min(audio.currentTime, audio.__lastTime || 0); }catch(e){}
        }
      });
      audio.addEventListener('timeupdate', ()=>{
        audio.__lastTime = audio.currentTime;
      });
    }catch(e){}
  }

  // Section flag (used for seeking block)
  let _sectionIsListening = null;
  function setSectionIsListening(fn){ _sectionIsListening = fn; }
  function sectionIsListening(){ return (typeof _sectionIsListening === 'function') ? !!_sectionIsListening() : false; }

  // --- Data roots + indices ---
  const READ_ROOT_KEY = 'toefl_read_root';
  const READ_CACHE_KEY = 'toefl_read_index';
  const LISTEN_ROOT_KEY = 'toefl_list_root';
  const LISTEN_CACHE_KEY = 'toefl_list_index';

  let _readingIndex = null;
  let _listeningIndex = null;

  function readingFileName(id){
    return `TOEFL_Reading_${String(id).padStart(4,'0')}.txt`;
  }
  function listeningFolderName(set){
    return `Listening_Set_${String(set).padStart(3,'0')}`;
  }

  async function detectReadingRoot(){
    const cached = sessionStorage.getItem(READ_ROOT_KEY);
    if(cached) return cached;

    // Cloudflare Pages/정적 호스팅에서는 폴더 리스팅이 없으니,
    // "TOEFL_Reading_0001"이 꼭 있어야 한다고 가정하면(사용자가 일부 파일만 넣는 경우) 인식이 실패할 수 있어.
    // 그래서 1~60번까지 빠르게 스캔해서 "아무거나 하나"라도 있으면 루트를 인정하도록 한다.
    const root = 'data/reading';
    for(let id=1; id<=60; id++){
      const probe = `${root}/${readingFileName(id)}`;
      if(await existsUrl(probe)){
        sessionStorage.setItem(READ_ROOT_KEY, root);
        sessionStorage.setItem(READ_CACHE_KEY, ''); // invalidate cached index
        return root;
      }
    }

    return null;
  }

  async function detectListeningRoot(){
    const cached = sessionStorage.getItem(LISTEN_ROOT_KEY);
    if(cached) return cached;

    const candidates = [
      'data/listening',
      // common wrapper dirs from your zip
      'data/listening/TOEFL_Listening_Pack_v6_6_QOnly_NoChoices',
      'data/listening/TOEFL_Listening_Pack_v6_6_QOnly_NoChoices/TOEFL_Listening_Pack_v6_6_QOnly_NoChoices'
    ];

    async function hasSet(root){
      // 001이 꼭 존재한다고 가정하면 일부 세트만 올렸을 때 인식이 실패할 수 있어.
      // 1~60 세트까지 빠르게 스캔해서 "아무거나 하나"라도 있으면 루트로 인정.
      for(let id=1; id<=60; id++){
        const probe = `${root}/${listeningFolderName(id)}/answer_key.txt`;
        if(await existsUrl(probe)) return true;
      }
      return false;
    }

    for(const root of candidates){
      if(await hasSet(root)){
        sessionStorage.setItem(LISTEN_ROOT_KEY, root);
        sessionStorage.setItem(LISTEN_CACHE_KEY, ''); // invalidate cached index
        return root;
      }
    }
    return null;
  }

  async function getReadingIndex(){
    if(_readingIndex) return _readingIndex;
    const cached = sessionStorage.getItem(READ_CACHE_KEY);
    if(cached){
      try{ _readingIndex = JSON.parse(cached); return _readingIndex; }catch(e){}
    }
    _readingIndex = await buildReadingIndex();
    sessionStorage.setItem(READ_CACHE_KEY, JSON.stringify(_readingIndex));
    return _readingIndex;
  }

  async function getListeningIndex(){
    if(_listeningIndex) return _listeningIndex;
    const cached = sessionStorage.getItem(LISTEN_CACHE_KEY);
    if(cached){
      try{ _listeningIndex = JSON.parse(cached); return _listeningIndex; }catch(e){}
    }
    _listeningIndex = await buildListeningIndex();
    sessionStorage.setItem(LISTEN_CACHE_KEY, JSON.stringify(_listeningIndex));
    return _listeningIndex;
  }

  async function findMaxReadingId(root){
    // Exponential search + binary search
    // NOTE: 0001이 없어도(예: 0002부터 존재) 최대치를 찾을 수 있게 "첫 존재"를 먼저 찾는다.
    const CAP = 1000;
    let first = 0;
    for(let id=1; id<=60; id++){
      if(await existsUrl(`${root}/${readingFileName(id)}`)) { first = id; break; }
    }
    if(!first) return 0;

    let lo = first;
    let hi = first;
    while(hi <= CAP && await existsUrl(`${root}/${readingFileName(hi)}`)){
      lo = hi;
      hi *= 2;
    }
    hi = Math.min(hi, CAP);

    // binary search for last existing in (lo, hi)
    let left = lo;
    let right = hi;
    while(left + 1 < right){
      const mid = Math.floor((left + right)/2);
      if(await existsUrl(`${root}/${readingFileName(mid)}`)) left = mid;
      else right = mid;
    }
    return left;
  }

  async function buildReadingIndex(){
    const root = await detectReadingRoot();
    if(!root) throw new Error('Reading 데이터가 없어. 예: data/reading/TOEFL_Reading_0002.txt 같은 파일이 있어야 해. (Passage는 최대 1000번까지 인식)');

    // If an index.json exists, prefer it.
    const indexUrl = `${root}/index.json`;
    if(await existsUrl(indexUrl)){
      try{
        const idx = await fetchJson(indexUrl);
        // Normalize minimal fields
        return idx.map((it, i)=>({
          id: Number(it.id || it.passageId || (i+1)),
          title: it.title || `Passage ${String(it.id||it.passageId||i+1).padStart(4,'0')}`,
          wordCount: it.wordCount || null,
          file: it.file || readingFileName(Number(it.id||it.passageId||i+1)),
          root
        })).sort((a,b)=>a.id-b.id);
      }catch(e){ /* fallthrough */ }
    }

    const maxId = await findMaxReadingId(root);
    const cappedMaxId = Math.min(maxId, 1000);
    if(!cappedMaxId) throw new Error('Reading txt 파일을 못 찾았어. 예: data/reading/TOEFL_Reading_0002.txt');

    // Create lightweight index (titles are shown as 기본값; 뷰어에서 실제 제목 파싱)
    // 0001이 없고 0002부터 존재하는 경우를 위해, 시작 id를 1~60 스캔으로 찾는다.
    let startId = 1;
    for(let id=1; id<=60; id++){
      if(await existsUrl(`${root}/${readingFileName(id)}`)) { startId = id; break; }
    }
    const out = [];
    for(let id=startId; id<=cappedMaxId; id++){
      out.push({
        id,
        title: `Passage ${String(id).padStart(4,'0')}`,
        wordCount: null,
        file: readingFileName(id),
        root
      });
    }
    return out;
  }

  async function findMaxListeningSet(root){
    const CAP = 100;
    // 001이 없어도 최대치 찾기: 먼저 첫 존재를 찾는다.
    let first = 0;
    for(let id=1; id<=60; id++){
      if(await existsUrl(`${root}/${listeningFolderName(id)}/answer_key.txt`)) { first = id; break; }
    }
    if(!first) return 0;

    let lo = first;
    let hi = first;
    while(hi <= CAP && await existsUrl(`${root}/${listeningFolderName(hi)}/answer_key.txt`)){
      lo = hi;
      hi *= 2;
    }
    hi = Math.min(hi, CAP);
    let left = lo;
    let right = hi;
    while(left + 1 < right){
      const mid = Math.floor((left + right)/2);
      if(await existsUrl(`${root}/${listeningFolderName(mid)}/answer_key.txt`)) left = mid;
      else right = mid;
    }
    return left;
  }

  async function buildListeningIndex(){
    const root = await detectListeningRoot();
    if(!root) throw new Error('Listening 데이터가 없어. 예: /data/listening/Listening_Set_001/answer_key.txt');

    // If an index.json exists, prefer it.
    const indexUrl = `${root}/index.json`;
    if(await existsUrl(indexUrl)){
      try{
        const idx = await fetchJson(indexUrl);
        return idx.map((it, i)=>{
          const set = Number(it.set || it.id || (i+1));
          const folder = it.folder || listeningFolderName(set);
          return {
            set,
            folder,
            path: `${root}/${folder}`,
            format: it.format || 'unknown',
            category: it.category || '',
            main_topic: it.main_topic || it.scenario || '',
            scenario: it.scenario || '',
            v: it.v || ''
          };
        }).sort((a,b)=>a.set-b.set);
      }catch(e){ /* fallthrough */ }
    }

    const maxId = await findMaxListeningSet(root);
    if(!maxId) throw new Error('Listening 세트를 못 찾았어. 예: /data/listening/Listening_Set_001/answer_key.txt');

    // 001부터 연속이 아닐 수 있어서, 시작 set을 1~60 스캔으로 찾는다.
    let startSet = 1;
    for(let id=1; id<=60; id++){
      if(await existsUrl(`${root}/${listeningFolderName(id)}/answer_key.txt`)) { startSet = id; break; }
    }

    const tasks = [];
    for(let set=startSet; set<=maxId; set++){
      const folder = listeningFolderName(set);
      tasks.push({ set, folder, path: `${root}/${folder}` });
    }

    // Fetch metadata.json best-effort (small files)
    const out = new Array(tasks.length);
    let cursor = 0;
    const CONC = 10;
    async function worker(){
      while(cursor < tasks.length){
        const i = cursor++;
        const t = tasks[i];
        try{
          const metaUrl = `${t.path}/metadata.json`;
          let meta = null;
          if(await existsUrl(metaUrl)){
            meta = await fetchJson(metaUrl);
          }
          out[i] = {
            set: t.set,
            folder: t.folder,
            path: t.path,
            format: meta?.format || 'unknown',
            category: meta?.category || '',
            main_topic: meta?.main_topic || meta?.scenario || '',
            scenario: meta?.scenario || '',
            v: meta?.v || ''
          };
        }catch(e){
          out[i] = { set: t.set, folder: t.folder, path: t.path, format:'unknown', category:'', main_topic:'', scenario:'', v:'' };
        }
      }
    }
    await Promise.all(Array.from({length: Math.min(CONC, tasks.length)}, ()=>worker()));
    return out.sort((a,b)=>a.set-b.set);
  }

  // --- Reading parsing ---
  function parseReadingTxt(raw){
    const lines = raw.replace(/\r\n/g,'\n').split('\n');
    let i=0;
    while(i<lines.length && !lines[i].trim()) i++;
    const title = (lines[i]||'Reading').trim();
    i++;

    // passage until first question "1." / "1)"
    const qStartRe = /^\s*(\d{1,2})\s*[\.\)]\s+/;
    const passageLines = [];
    while(i<lines.length){
      if(qStartRe.test(lines[i])) break;
      passageLines.push(lines[i]);
      i++;
    }

    // questions
    const questions = [];
    const choiceRe = /^\s*([A-D])\s*[\)\.\:]\s*(.+)\s*$/i;
    while(i<lines.length){
      const m = lines[i].match(qStartRe);
      if(!m){ i++; continue; }
      const qNum = Number(m[1]);
      const stem = lines[i].replace(qStartRe,'').trim();
      i++;
      const choices = [];
      while(i<lines.length){
        const l = lines[i];
        if(qStartRe.test(l)) break;
        const cm = l.match(choiceRe);
        if(cm){
          choices.push({ letter: cm[1].toUpperCase(), text: cm[2].trim() });
        }else{
          // wrap line
          if(choices.length && l.trim()){
            choices[choices.length-1].text += ' ' + l.trim();
          }
        }
        i++;
      }
      questions.push({ num:qNum, type:'MC', stem, choices, answer:null });
    }

    // answer key
    const answers = {};
    const ansRe = /(^|\n)\s*(\d{1,2})\s*[\.\)\:]\s*([A-D])\b/g;
    let mm;
    while((mm = ansRe.exec(raw))!==null){
      answers[Number(mm[2])] = mm[3].toUpperCase();
    }
    for(const q of questions){
      q.answer = answers[q.num] || null;
    }

    return { title, passage: passageLines.join('\n').trim(), questions };
  }

  async function loadReadingPassage(file, root='data/reading'){
    const raw = await fetchText(`${root}/${file}`);
    return parseReadingTxt(raw);
  }

  // --- Listening parsing ---
  function parseAnswerKey(txt){
    const m = {};
    if(!txt) return m;
    const re = /(^|\n)\s*(\d{1,2})\s*[\.\:\)]?\s*([A-D])\b/gi;
    let mm;
    while((mm = re.exec(txt))!==null){
      m[Number(mm[2])] = mm[3].toUpperCase();
    }
    return m;
  }

  function parseListeningQuestions(questionsTxt, metadata){
    // Prefer metadata if it has questions array
    if(metadata && Array.isArray(metadata.questions) && metadata.questions.length){
      return metadata.questions.map((qq, idx)=>({
        num: idx+1,
        stem: (qq.stem||qq.question||'').trim(),
        choices: (qq.choices||qq.options||[]).map((c,i)=>({
          letter: String.fromCharCode(65+i),
          text: typeof c==='string'? c : (c.text||'')
        })),
        answer: null
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
      const num = Number(m[1]);
      let stem = (m[2]||'').trim();
      i++;
      const choices=[];
      while(i<lines.length){
        const l = lines[i];
        if(qStart.test(l)) break;
        const cm = l.match(choiceRe);
        if(cm){
          choices.push({letter:cm[1].toUpperCase(), text:cm[2].trim()});
        }else{
          if(choices.length && l.trim()){
            choices[choices.length-1].text += ' ' + l.trim();
          }else if(!choices.length && l.trim()){
            stem += ' ' + l.trim();
          }
        }
        i++;
      }
      out.push({num, stem, choices, answer:null});
    }
    return out;
  }

  async function loadListeningSet(set, root){
    const folder = typeof set === 'string' ? set : listeningFolderName(set);
    const path = `${root}/${folder}`;

    const answerKeyTxt = await fetchText(`${path}/answer_key.txt`);
    const answers = parseAnswerKey(answerKeyTxt);

    let metadata = null;
    let questionsTxt = null;
    try{
      if(await existsUrl(`${path}/metadata.json`)) metadata = await fetchJson(`${path}/metadata.json`);
    }catch(e){}
    try{
      if(await existsUrl(`${path}/questions.txt`)) questionsTxt = await fetchText(`${path}/questions.txt`);
    }catch(e){}

    const questions = parseListeningQuestions(questionsTxt, metadata);

    for(const q of questions){
      q.answer = answers[q.num] || null;
      q.audio = `${path}/questions_q${String(q.num).padStart(2,'0')}.mp3`;
    }

    return {
      set: typeof set === 'number' ? set : Number(String(set).match(/\d+/)?.[0]||0),
      folder,
      path,
      main: `${path}/listening.mp3`,
      metadata,
      questions
    };
  }

  function pickRandom(arr, n){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a.slice(0, Math.min(n, a.length));
  }

  // --- Service Worker 등록: data 폴더 직접 URL 접근(네비게이션) 차단 ---
  try{
    if('serviceWorker' in navigator){
      window.addEventListener('load', ()=>{
        navigator.serviceWorker.register('sw.js').catch(()=>{});
      });
    }
  }catch(e){}

  window.TOEFL = {
    $, $$, escapeHtml, ensureGlobal, fmtTime, toast,
    showLoading, hideLoading, withLoading,
    secureAudio, setSectionIsListening,
    getReadingIndex, loadReadingPassage,
    getListeningIndex, loadListeningSet, detectListeningRoot,
    pickRandom
  };


  // --- Soft block hard refresh (Shift+F5 etc.) during Simulation ---
  function __toeflIsSimContext(){
    try{
      if(document.body && document.body.classList.contains('sim')) return true;
      const h = location.hash || '';
      if(h.startsWith('#/sim')) return true;
      const qs = location.search || '';
      if(qs.includes('mode=sim')) return true;
      return false;
    }catch(e){ return false; }
  }

  try{
    window.addEventListener('keydown', (e)=>{
      const isHardRefresh = (e.key === 'F5' && e.shiftKey) || (e.key === 'r' && (e.ctrlKey||e.metaKey) && e.shiftKey);
      if(isHardRefresh && __toeflIsSimContext()){
        e.preventDefault();
        toast('SimTest 중에는 새로고침이 제한돼');
      }
    }, {capture:true});

    window.addEventListener('beforeunload', (e)=>{
      if(__toeflIsSimContext()){
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
  }catch(e){}

})();
