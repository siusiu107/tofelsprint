
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

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // --- Passage text formatting (remove hard-wrap newlines) ---
  // Many reading TXT files are hard-wrapped at ~60-80 chars. We want paragraphs to flow naturally.
  // Rules:
  //  - Blank lines separate paragraphs
  //  - Within a paragraph, join wrapped lines with spaces
  //  - If a line ends with a hyphen and the next line continues the word, remove the hyphen
  //  - Remove '(Approx. word count: N)' lines
  function normalizeWrappedText(text){
    if(text == null) return '';
    let t = String(text);
    // normalize newlines
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // remove BOM
    t = t.replace(/^\uFEFF/, '');
    // remove word-count meta lines
    const lines0 = t.split('\n');
    const lines1 = [];
    for(const ln of lines0){
      const s = (ln || '').trim();
      if(/^\(\s*Approx\.?\s*word\s*count\s*:\s*\d+\s*\)\s*$/i.test(s)) continue;
      lines1.push(ln);
    }
    t = lines1.join('\n');

    // split into paragraph blocks
    const blocks = t.split(/\n\s*\n+/);
    const paras = [];
    for(const b of blocks){
      const rawLines = String(b).split('\n');
      const kept = rawLines.map(x => (x || '').trim()).filter(x => x.length > 0);
      if(!kept.length) continue;

      let acc = kept[0];
      for(let i=1;i<kept.length;i++){
        const next = kept[i];
        const prev = acc;

        // de-hyphenate if line break splits a word
        if(/[A-Za-z]-$/.test(prev) && /^[A-Za-z]/.test(next)){
          acc = prev.slice(0, -1) + next;
          continue;
        }

        // default: join with single space
        acc = prev + ' ' + next;
      }

      // collapse multiple spaces
      acc = acc.replace(/\s+/g, ' ').trim();
      paras.push(acc);
    }

    return paras.join('\n\n');
  }

  function getPassageParagraphs(text){
    const normalized = normalizeWrappedText(text);
    if(!normalized) return [];
    return normalized
      .split(/\n\s*\n/g)
      .map(p => String(p).trim())
      .filter(p => p.length > 0);
  }

  function formatPassageHtml(text){
    const blocks = getPassageParagraphs(text);
    return blocks.map((p,i) => `<p class="p" data-idx="${i}">${escapeHtml(p)}</p>`).join('');
  }

  // Extract the referenced sentence from a reading question prompt (best-effort)
  // Examples:
  //  - "Sentence: [A] Because ... rare events."
  function getSentenceHintFromPrompt(prompt){
    if(prompt == null) return '';
    const s = String(prompt);
    const lower = s.toLowerCase();
    const pos = lower.lastIndexOf('sentence:');
    if(pos === -1) return '';
    let tail = s.slice(pos + 'sentence:'.length);
    // stop at another bracketed label if it appears (e.g., "[Reference]")
    // but keep common cases where label comes before Sentence:
    tail = tail.split(/\n\s*\[[^\]]+\]\s*/)[0];
    tail = tail.replace(/\s+/g,' ').trim();
    // remove leading [A] etc.
    tail = tail.replace(/^\[[A-D]\]\s*/i,'');
    return tail.trim();
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

  /* Reading: Cloudflare Pages 환경에서도 동작하도록 (디렉토리 리스팅 없이) */
  const READ_CACHE_KEY = 'toefl_reading_index_v2';
  const READ_ROOT_KEY  = 'toefl_reading_root_v2';

  let _readingIndex = null;

  async function existsUrl(url){
    // Prefer HEAD to avoid downloading large files, fallback to GET if HEAD is blocked.
    try{
      let res = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(res && (res.status === 405 || res.status === 501)){
        res = await fetch(url, { method:'GET', cache:'no-store', headers: { 'Range': 'bytes=0-0' } });
      }
      return !!(res && res.ok);
    }catch(e){
      try{
        const res2 = await fetch(url, { method:'GET', cache:'no-store', headers: { 'Range': 'bytes=0-0' } });
        return !!(res2 && res2.ok);
      }catch(e2){
        return false;
      }
    }
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

  function readingFileName(id){
    return `TOEFL_Reading_${String(id).padStart(4,'0')}.txt`;
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

  async function loadReadingPassage(file, rootOverride=null){
    const root = rootOverride || (await detectReadingRoot()) || 'data/reading';
    try{
      const raw = await fetchText(`${root}/${file}`);
      return parseReadingTxt(raw);
    }catch(e){
      throw new Error('Reading 지문 파일을 못 찾았어. 예: /data/reading/TOEFL_Reading_0002.txt');
    }
  }

  function parseReadingTxt(raw){
    const lines = raw.replace(/\r\n/g,'\n').split('\n');

    // title
    const header = lines[0] || '';
    const titleMatch = header.match(/^Passage\s+(\d+):\s*(.+)$/);
    const id = titleMatch ? Number(titleMatch[1]) : null;
    let title = titleMatch ? titleMatch[2].trim() : header.trim();

    // optional word count (metadata only; never shown in passage body)
    const wordCountMatch = raw.match(/Approx\.\s*word count:\s*(\d+)/i);
    const wordCount = wordCountMatch ? Number(wordCountMatch[1]) : null;

    // locate question/answer sections robustly (some files may not contain "Questions" label)
    let qStart = lines.findIndex(l => l.trim().toLowerCase() === 'questions');
    let answerStart = lines.findIndex(l => l.trim().toLowerCase() === 'answer key');

    const qLineRe = /^\s*\d{1,2}\s*[\.\)](?:\s+|$)/;

    if(qStart === -1){
      // fallback: first question-looking line
      qStart = lines.findIndex(l => qLineRe.test(l));
    }else{
      // "Questions" line exists; often a separator follows
      // keep as-is; we slice up to qStart
    }

    if(answerStart === -1){
      // fallback: any "answer key" looking line
      answerStart = lines.findIndex(l => /^answer\s*key\b/i.test(l.trim()));
    }

    // passage block
    const passageLines = lines.slice(0, qStart === -1 ? lines.length : qStart);

    // Remove headers/metadata so the passage panel shows ONLY the actual passage text.
    const isMetaLine = (line)=>{
      const t = (line||'').trim();
      if(!t) return false; // keep blank lines to preserve paragraph breaks
      if(/^=+$/.test(t) || /^-+$/.test(t)) return true;
      if(/^Passage\s+\d+\s*:/i.test(t)) return true;
      if(/^The\s+following\s+passage\s+is\s+for\s+questions\b/i.test(t)) return true;
      if(/\bApprox\.?\s*word\s*count\b/i.test(t)) return true;
      if(/\bword\s*count\b/i.test(t)) return true;
      // some sources put word-count lines in parentheses
      if(/^\(\s*Approx\.?\s*word\s*count\b/i.test(t)) return true;
      return false;
    };

    // First pass: drop obvious meta lines anywhere in the pre-question block
    let passageOnlyLines = passageLines.filter(l => !isMetaLine(l));

    // Second pass: if meta lines still exist at the start (we preserved some blanks), trim them
    while(passageOnlyLines.length && ((passageOnlyLines[0]||'').trim()==='' || isMetaLine(passageOnlyLines[0]))) passageOnlyLines.shift();

    let cleanedPassage = passageOnlyLines.join('\n').trim();
    // Remove any remaining word-count snippets (best-effort)
    cleanedPassage = cleanedPassage
      .replace(/\(\s*Approx\.?\s*word\s*count\s*:\s*\d+\s*\)/ig,'')
      .replace(/Approx\.?\s*word\s*count\s*:\s*\d+/ig,'')
      .replace(/\n{3,}/g,'\n\n')
      .trim();

    // question block
    let qLines = [];
    if(qStart !== -1){
      let qFrom = qStart;

      // If this is the literal "Questions" marker, skip it and any blank/separator lines.
      if(lines[qStart] && lines[qStart].trim().toLowerCase() === 'questions'){
        qFrom = qStart + 1;
        while(qFrom < lines.length){
          const t = (lines[qFrom]||'').trim();
          if(!t || /^=+$/.test(t)){ qFrom++; continue; }
          break;
        }
      }

      const qTo = (answerStart !== -1 && answerStart > qFrom) ? answerStart : lines.length;
      qLines = lines.slice(qFrom, qTo);
    }

    // answers
    const aLines = (answerStart !== -1) ? lines.slice(answerStart) : [];

    // Answer key formats vary across sources. Support common variants:
    //  - "1. B"  "1) B"  "1: B"  "1 - B"  "1\tB"  "1 B"
    const answers = {};
    for(const l of aLines){
      const mm = l.match(/^\s*(\d{1,2})\s*(?:[\.\)\:\-]|\u2013|\u2014)?\s*([A-D])\b/i);
      if(mm) answers[Number(mm[1])] = mm[2].toUpperCase();
    }

    // parse questions: "1. stem", options "A) ...", "B) ..."
    const questions = [];
    let i = 0;
    while(i < qLines.length){
      const line = qLines[i];
      const qm = line.match(/^\s*(\d{1,2})\s*[\.\)]\s*(.*)\s*$/);
      if(!qm){ i++; continue; }
      const num = Number(qm[1]);
      let stem = (qm[2]||'').trim();
      i++;

      const choices = [];
      while(i < qLines.length){
        const l = qLines[i];
        if(qLineRe.test(l)) break;

        const cm = l.match(/^\s*([A-D])\s*(?:[\)\.\:]\s*|\s+)(.+)\s*$/i);
        if(cm){
          choices.push({ letter: cm[1].toUpperCase(), text: (cm[2]||'').trim() });
        }else{
          // continuation line
          const t = l.trim();
          if(t){
            if(choices.length){
              choices[choices.length-1].text += ' ' + t;
            }else{
              stem += (stem ? '\n' : '') + t;
            }
          }
        }
        i++;
      }

      questions.push({
        num,
        type: 'MC',
        prompt: stem,
        choices,
        correct: answers[num] || null,
        // 호환용
        stem,
        answer: answers[num] || null
      });
    }

    // Strip any trailing metadata from title (rare cases)
    title = title.replace(/\(approx\.\s*word\s*count[^)]*\)/ig,'').trim();

    return { id, title, wordCount, passage: cleanedPassage, questions };
  }

/* Listening: Cloudflare Pages 환경에서도 동작하도록 (디렉토리 리스팅 없이) */
const LISTEN_CACHE_KEY = 'toefl_listening_index_v2';
const LISTEN_ROOT_KEY = 'toefl_listening_root_v2';

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

  for(const c of candidates){
    if(await hasSet(c)){
      sessionStorage.setItem(LISTEN_ROOT_KEY, c);
      return c;
    }
  }
  return null;
}


  function listeningFolderName(id){
    return `Listening_Set_${String(id).padStart(3,'0')}`;
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

  async function getListeningIndex(){
    const cached = sessionStorage.getItem(LISTEN_CACHE_KEY);
    if(cached){
      try{ return JSON.parse(cached); }catch(e){}
    }
    const idx = await buildListeningIndex();
    sessionStorage.setItem(LISTEN_CACHE_KEY, JSON.stringify(idx));
    return idx;
  }

  async function loadListeningSet(entry){
    const base = entry.path;
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

  function parseListeningQuestions(txt){
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
    const lines = String(txt||'').replace(/\r\n/g,'\n').split('\n');
    for(let line of lines){
      line = String(line||'').trim();
      if(!line) continue;

      // Accept: "Q1: A", "Q1: A - explanation", "1: A", "1) A", "Q4: D - ...", etc.
      // Also accept dash variants: -, –, —
      let m = line.match(/^(?:Q)?(\d+)\s*[:\.\)]\s*([A-D])(?:\s*[-–—]\s*(.*))?$/i);
      if(m){
        const num = Number(m[1]);
        const letter = String(m[2]).toUpperCase();
        const explain = (m[3]||'').trim();
        out[num] = { letter, explain };
        continue;
      }

      // Fallback: find first "Q?num" + letter anywhere in line
      m = line.match(/\bQ?(\d+)\b[^A-D]*\b([A-D])\b/i);
      if(m){
        const num = Number(m[1]);
        const letter = String(m[2]).toUpperCase();
        let explain = '';
        const dash = line.match(/[-–—]\s*(.*)$/);
        if(dash) explain = (dash[1]||'').trim();
        out[num] = { letter, explain };
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
    $, $$, escapeHtml, normalizeWrappedText, getPassageParagraphs, formatPassageHtml, getSentenceHintFromPrompt, ensureGlobal, fmtTime, toast,
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
    }catch(e){}
    return false;
  }

  function __toeflToast(msg){
    try{
      const el = document.getElementById('toast');
      if(!el){ alert(msg); return; }
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(el.__t);
      el.__t = setTimeout(()=> el.classList.add('hidden'), 1400);
    }catch(e){
      try{ alert(msg); }catch(_){}
    }
  }

  function __toeflInstallReloadBlock(){
    if(window.__toeflReloadBlock) return;
    window.__toeflReloadBlock = true;

    window.addEventListener('keydown', (e)=>{
      if(!__toeflIsSimContext()) return;

      const key = (e.key || '').toLowerCase();
      const isF5 = (e.key === 'F5' || e.code === 'F5' || e.keyCode === 116);
      const isHard = isF5 && (e.shiftKey || e.ctrlKey);
      const isSoft = isF5 || ((e.ctrlKey || e.metaKey) && key === 'r');

      if(isHard || isSoft){
        try{
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation && e.stopImmediatePropagation();
        }catch(_){}
        __toeflToast('실전모드에서는 새로고침이 제한돼.');
        return false;
      }
    }, true);

    // Even if refresh happens, show a confirm dialog on unload (soft deterrent)
    window.addEventListener('beforeunload', (e)=>{
      if(!__toeflIsSimContext()) return;
      try{
        e.preventDefault();
        e.returnValue = '';
      }catch(_){}
    });
  }

  // install immediately
  try{ __toeflInstallReloadBlock(); }catch(e){}


})();
