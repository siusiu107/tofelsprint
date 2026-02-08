/* sim.js - Simulation popup (v5)
   요구사항:
   - Listening: 오디오 재생 중엔 문제 표시 X
   - Listening: 질문 오디오 끝나면(답 선택 여부와 관계없이) 자동 다음
   - Simulation 종료 후 점수 + 리뷰 제공
*/
(function(){
  const {
    $, $$, toast, fmtTime, secureAudio, setSectionIsListening,
    getReadingIndex, loadReadingPassage,
    getListeningIndex, loadListeningSet, pickRandom
  } = window.TOEFL;

  const main = $('#main');
  const subbar = $('#subbar');
  const sectionCounter = $('#simSectionCounter');

  const audioBarFill = $('#audioBarFill');
  const audioBarLabel = $('#audioBarLabel');
  const audioBarTime = $('#audioBarTime');

  const SIM = {
    readingTimeSec: 36*60,
    listeningTimeSec: 41*60,
    readingPassages: 2,
    listeningLecture: 3,
    listeningConv: 2,
  };

  // timers
  let timerTick = null;
  let sectionRemain = 0;

  // section state
  let section = 'init'; // reading | listening | done

  // plans
  let readingPlan = [];
  let listeningPlan = [];

  // caches
  const readingCache = new Map();   // file -> parsed passage
  const listeningCache = new Map(); // set -> {entry, questions}

  // simulation selection rules (fixed per run)
  const readingVariant = new Map();      // file -> keepTable(true) or keepSummary(false)
  const readingFilteredQs = new Map();   // file -> filtered question array
  const listeningSubsetNums = new Map(); // set -> [qnum,...] (length 6)

  // answers (in-memory)
  const answers = {
    reading: {},   // file -> { [qnum]: letter }
    listening: {}  // set  -> { [qnum]: letter }
  };

  // current pointers
  let currentReading = { passageIdx: 0, qIdx: 0, data: null, qs: [] };
  let currentListening = { setIdx: 0, qIdx: 0, data: null, qs: [], phase: 'idle' };

  // audio
  const audio = new Audio();
  audio.preload = 'auto';

  // audio 조작(배속/시킹/일시정지) 최대한 차단
  setSectionIsListening(()=> section === 'listening');
  secureAudio(audio, { blockPause:true });

  function setSubbar(text){ subbar.textContent = text; }

  function startSectionTimer(sec){
    sectionRemain = sec;
    clearInterval(timerTick);
    timerTick = setInterval(()=>{
      sectionRemain = Math.max(0, sectionRemain - 1);
      renderSectionCounter();
      if(sectionRemain === 0){
        if(section === 'reading') finishReadingSection(true);
        if(section === 'listening') finishListeningSection(true);
      }
    }, 1000);
    renderSectionCounter();
  }

  function renderSectionCounter(){
    const label = (section === 'reading') ? 'READING' : (section === 'listening' ? 'LISTENING' : 'DONE');
    sectionCounter.textContent = `${label} · ${fmtTime(sectionRemain)}`;
  }

  function updateAudioBar(){
    audioBarLabel.textContent = 'Listening (audio)';
    const dur = audio.duration || 0;
    const cur = audio.currentTime || 0;
    const rem = Math.max(0, dur - cur);
    audioBarTime.textContent = fmtTime(rem);
    audioBarFill.style.width = (dur > 0) ? `${Math.max(0, Math.min(100, (cur/dur)*100))}%` : '0%';
  }
  setInterval(updateAudioBar, 120);

  function play(url){
    audio.src = url;
    audio.currentTime = 0;
    audio.play().catch(()=> toast('오디오 재생 실패. 화면 한번 터치/클릭 해줘'));
  }

  function stopAllTimers(){
    clearInterval(timerTick); timerTick = null;  }

  function escape(s){ return (s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function escapeMultiline(s){ return (s||'').split('\n').map(escape).join('<br/>'); }

  function renderPassageHtml(text){
    return (text||'')
      .split(/\n\s*\n/g)
      .map(p=>`<p>${escape(p).replace(/\n/g,'<br/>')}</p>`)
      .join('');
  }

  function gradeChoices(wrap, correct, selected){
    const choices = $$('.choice', wrap);
    for(const el of choices){
      const letter = el.querySelector('.letter')?.textContent?.trim();
      el.classList.remove('correct','wrong','selected');
      if(letter === selected) el.classList.add('selected');
      if(letter === correct) el.classList.add('correct');
      if(letter === selected && selected !== correct) el.classList.add('wrong');
    }
  }

  // ---------- Reading ----------
  async function ensureReadingLoaded(planItem){
    const key = planItem.file;
    if(readingCache.has(key) && readingFilteredQs.has(key)){
      return { data: readingCache.get(key), qs: readingFilteredQs.get(key) };
    }

    const parsed = await loadReadingPassage(planItem.file, planItem.root || null);
    readingCache.set(key, parsed);

    const hasTable = parsed.questions.some(q => (q.type||'').toLowerCase().includes('table'));
    const hasSummary = parsed.questions.some(q => (q.type||'').toLowerCase().includes('prose summary'));
    let qs = parsed.questions.slice();

    if(hasTable && hasSummary){
      if(!readingVariant.has(key)) readingVariant.set(key, Math.random() < 0.5); // true=keepTable
      const keepTable = readingVariant.get(key);
      qs = qs.filter(q => keepTable ? !(q.type||'').toLowerCase().includes('prose summary') : !(q.type||'').toLowerCase().includes('table'));
    }

    readingFilteredQs.set(key, qs);
    return { data: parsed, qs };
  }

  function setReadingAnswer(file, qnum, letter){
    if(!answers.reading[file]) answers.reading[file] = {};
    answers.reading[file][qnum] = letter;
  }

  function getReadingAnswer(file, qnum){
    return answers.reading[file]?.[qnum] || null;
  }

  async function startReading(){
    currentReading.passageIdx = 0;
    currentReading.qIdx = 0;
    const it = readingPlan[currentReading.passageIdx];
    const {data, qs} = await ensureReadingLoaded(it);
    currentReading.data = data;
    currentReading.qs = qs;
    renderReading();
  }

  async function gotoReading(passageIdx, qIdx){
    currentReading.passageIdx = Math.max(0, Math.min(readingPlan.length-1, passageIdx));
    const it = readingPlan[currentReading.passageIdx];
    const {data, qs} = await ensureReadingLoaded(it);
    currentReading.data = data;
    currentReading.qs = qs;
    currentReading.qIdx = Math.max(0, Math.min(qs.length-1, qIdx));
    renderReading();
  }

  function renderReading(){
    const it = readingPlan[currentReading.passageIdx];
    const data = currentReading.data;
    const qs = currentReading.qs;
    const q = qs[currentReading.qIdx];

    const pNum = currentReading.passageIdx + 1;
    const pTot = readingPlan.length;
    const qNum = currentReading.qIdx + 1;
    const qTot = qs.length;

    setSubbar('Simulation > Reading');
    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">The following passage is for questions 1–${qTot}.</div>
              <div class="muted small">${escape(it.title||data.title||'')} ${it.wordCount?` · ${it.wordCount} words`:''}</div>
            </div>
            <div class="row">
              <span class="badge">Passage ${pNum}/${pTot}</span>
            </div>
          </div>
          <div class="panel-body">${renderPassageHtml(data.passage)}</div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">Question</div>
            <div class="row">
              <span class="pill">${String(qNum).padStart(2,'0')}/${String(qTot).padStart(2,'0')}</span>
              <button class="btn secondary" id="btnPrevQ">◀</button>
              <button class="btn secondary" id="btnNextQ">▶</button>
            </div>
          </div>
          <div class="panel-body">
            <div class="qwrap" id="qWrap"></div>
          </div>
        </section>
      </div>
    `;

    const wrap = $('#qWrap');
    wrap.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'qhead';
    head.innerHTML = `<div class="qnum">${q.num}</div><div><div class="qtext">${escapeMultiline(q.prompt)}</div></div>`;
    wrap.appendChild(head);

    let selected = getReadingAnswer(it.file, q.num);
    for(const ch of q.choices){
      const el = document.createElement('div');
      el.className = 'choice';
      if(selected === ch.letter) el.classList.add('selected');
      el.innerHTML = `<div class="letter">${ch.letter}</div><div>${escape(ch.text)}</div>`;
      el.onclick = ()=>{
        selected = ch.letter;
        setReadingAnswer(it.file, q.num, selected);
        $$('.choice', wrap).forEach(c=>c.classList.remove('selected'));
        el.classList.add('selected');
      };
      wrap.appendChild(el);
    }

    const hint = document.createElement('div');
    hint.className = 'muted small';
    hint.style.marginTop = '10px';
    hint.textContent = '※ Simulation 중에는 정/오답을 바로 보여주지 않아. 끝나면 채점 + 리뷰 제공.';
    wrap.appendChild(hint);

    $('#btnPrevQ').onclick = async ()=>{
      if(currentReading.qIdx > 0){
        currentReading.qIdx--;
        renderReading();
      }else if(currentReading.passageIdx > 0){
        await gotoReading(currentReading.passageIdx-1, 0);
      }
    };
    $('#btnNextQ').onclick = async ()=>{
      if(currentReading.qIdx < qs.length-1){
        currentReading.qIdx++;
        renderReading();
      }else{
        // next passage or finish
        if(currentReading.passageIdx < readingPlan.length-1){
          await gotoReading(currentReading.passageIdx+1, 0);
        }else{
          finishReadingSection(false);
        }
      }
    };
  }

  function finishReadingSection(fromTimer){
    clearInterval(timerTick);
    section = 'listening';
    setSubbar('Simulation > Listening');
    startSectionTimer(SIM.listeningTimeSec);
    startListening().catch(e=>renderError(e));
  }

  // ---------- Listening ----------
  function setListeningAnswer(setId, qnum, letter){
    if(!answers.listening[setId]) answers.listening[setId] = {};
    answers.listening[setId][qnum] = letter;
  }
  function getListeningAnswer(setId, qnum){
    return answers.listening[setId]?.[qnum] || null;
  }

  async function ensureListeningLoaded(entry){
    const setId = entry.set;
    if(listeningCache.has(setId) && listeningSubsetNums.has(setId)){
      const base = listeningCache.get(setId);
      const nums = listeningSubsetNums.get(setId);
      const qs = base.questions.filter(q=>nums.includes(q.num)).sort((a,b)=>a.num-b.num);
      return { base, qs };
    }

    const loaded = await loadListeningSet(entry);
    listeningCache.set(setId, loaded);

    // pick 6 questions: always include 1,2 then 4 random from rest
    const all = loaded.questions.slice();
    const fixed = all.filter(q=>q.num===1 || q.num===2);
    const rest = all.filter(q=>q.num!==1 && q.num!==2);
    const picked = pickRandom(rest, 4);
    const nums = [...fixed, ...picked].map(q=>q.num);
    listeningSubsetNums.set(setId, nums);

    const qs = all.filter(q=>nums.includes(q.num)).sort((a,b)=>a.num-b.num);
    return { base: loaded, qs };
  }

  async function startListening(){
    currentListening.setIdx = 0;
    currentListening.qIdx = 0;
    currentListening.phase = 'main';
    const entry = listeningPlan[currentListening.setIdx];
    const { base, qs } = await ensureListeningLoaded(entry);
    currentListening.data = base;
    currentListening.qs = qs;
    renderListeningPlaceholder('Main audio 재생 중…');
    play(fileUrl(`${entry.path}/listening.mp3`));
  }

  function renderListeningLayout(entry, qNum, qTot){
    const sNum = currentListening.setIdx + 1;
    const sTot = listeningPlan.length;

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Listening > ${escape(entry.format||'')}</div>
              <div class="muted small">${escape(entry.category||'')} · ${escape(entry.main_topic||entry.scenario||'')}</div>
            </div>
            <div class="row">
              <span class="badge">Set ${sNum}/${sTot}</span>
              <button class="btn secondary" id="btnStop">Stop</button>
            </div>
          </div>
          <div class="panel-body">
            <div class="muted small">&lt;오디오 재생 중엔 문제를 보여주지 않음&gt;</div>
            <div style="height:18px"></div>
            <div class="listen-figure">
              <div class="listen-avatar"></div>
              <div class="listen-board"></div>
            </div>
            <div style="height:18px"></div>
            <div class="muted small" id="phaseLabel">—</div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">Question</div>
            <div class="row">
              <span class="pill">${String(qNum).padStart(2,'0')}/${String(qTot).padStart(2,'0')}</span>
            </div>
          </div>
          <div class="panel-body">
            <div class="qwrap" id="qWrap"></div>
          </div>
        </section>
      </div>
    `;

    injectListeningIllustrationCSS();
    $('#btnStop').onclick = ()=>{
      audio.pause();
      finishListeningSection(false);
    };
  }

  function renderListeningPlaceholder(text){
    const entry = listeningPlan[currentListening.setIdx];
    const qs = currentListening.qs;
    const qNum = currentListening.qIdx + 1;
    const qTot = qs.length;
    renderListeningLayout(entry, qNum, qTot);
    $('#phaseLabel').textContent = text || 'Listening…';
    $('#qWrap').innerHTML = `<div class="muted" style="padding:10px">${escape(text||'Listening…')}</div>`;
  }

  function renderListeningQuestion(){
    const entry = listeningPlan[currentListening.setIdx];
    const qs = currentListening.qs;
    const q = qs[currentListening.qIdx];
    const qNum = currentListening.qIdx + 1;
    const qTot = qs.length;

    renderListeningLayout(entry, qNum, qTot);
    $('#phaseLabel').textContent = `Q${q.num} · 오디오 끝나면 자동 다음`;

    const wrap = $('#qWrap');
    wrap.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'qhead';
    head.innerHTML = `<div class="qnum">${q.num}</div><div><div class="qtext">${escapeMultiline(q.prompt)}</div></div>`;
    wrap.appendChild(head);

    let selected = getListeningAnswer(entry.set, q.num);
    for(const ch of q.choices){
      const el = document.createElement('div');
      el.className = 'choice';
      if(selected === ch.letter) el.classList.add('selected');
      el.innerHTML = `<div class="letter">${ch.letter}</div><div>${escape(ch.text)}</div>`;
      el.onclick = ()=>{
        selected = ch.letter;
        setListeningAnswer(entry.set, q.num, selected);
        $$('.choice', wrap).forEach(c=>c.classList.remove('selected'));
        el.classList.add('selected');
      };
      wrap.appendChild(el);
    }

    const hint = document.createElement('div');
    hint.className = 'muted small';
    hint.style.marginTop = '10px';
    hint.textContent = '※ 오디오 끝나면 자동으로 다음으로 넘어가 (답 선택 여부 상관없음).';
    wrap.appendChild(hint);
  }

  async function nextListening(){
    const qs = currentListening.qs;
    if(currentListening.qIdx < qs.length-1){
      currentListening.qIdx++;
      currentListening.phase = 'q';
      const entry = listeningPlan[currentListening.setIdx];
      renderListeningQuestion();
      const qnum = qs[currentListening.qIdx].num;
      play(fileUrl(`${entry.path}/questions_q${String(qnum).padStart(2,'0')}.mp3`));
      return;
    }

    // next set
    if(currentListening.setIdx < listeningPlan.length-1){
      currentListening.setIdx++;
      currentListening.qIdx = 0;
      currentListening.phase = 'main';
      const entry = listeningPlan[currentListening.setIdx];
      const { base, qs: nextQs } = await ensureListeningLoaded(entry);
      currentListening.data = base;
      currentListening.qs = nextQs;
      renderListeningPlaceholder('Main audio 재생 중…');
      play(fileUrl(`${entry.path}/listening.mp3`));
      return;
    }

    finishListeningSection(false);
  }

  audio.addEventListener('ended', async ()=>{
    if(section !== 'listening') return;
    const entry = listeningPlan[currentListening.setIdx];
    const qs = currentListening.qs;
    if(!qs || !qs.length) return;

    if(currentListening.phase === 'main'){
      // main ended -> start Q1 (문제는 보이게, 오디오는 끝나면 자동 다음)
      currentListening.phase = 'q';
      currentListening.qIdx = 0;
      renderListeningQuestion();
      play(fileUrl(`${entry.path}/questions_q${String(qs[0].num).padStart(2,'0')}.mp3`));
      return;
    }

    if(currentListening.phase === 'q'){
      // question audio ended -> next question/set automatically (답 선택 여부 상관없음)
      await nextListening();
      return;
    }
  });

  async function finishListeningSection(fromTimer){
    clearInterval(timerTick);    section = 'done';
    setSubbar('Simulation > Done');
    sectionCounter.textContent = 'DONE';
    await renderDone();
  }

  // ---------- Results + Review ----------
  function computeScores(){
    let rTot = 0, rOk = 0;
    for(const it of readingPlan){
      const qs = readingFilteredQs.get(it.file) || [];
      rTot += qs.length;
      for(const q of qs){
        const sel = getReadingAnswer(it.file, q.num);
        if(sel && q.correct && sel === q.correct) rOk++;
      }
    }

    let lTot = 0, lOk = 0;
    for(const entry of listeningPlan){
      const nums = listeningSubsetNums.get(entry.set) || [];
      const base = listeningCache.get(entry.set);
      const qs = (base?.questions || []).filter(q=>nums.includes(q.num)).sort((a,b)=>a.num-b.num);
      lTot += qs.length;
      for(const q of qs){
        const sel = getListeningAnswer(entry.set, q.num);
        if(sel && q.correct && sel === q.correct) lOk++;
      }
    }
    return { rOk, rTot, lOk, lTot, totalOk: rOk+lOk, totalTot: rTot+lTot };
  }

  async function ensureReviewDataLoaded(){
    // Reading: load all planned passages (only 2) for review if not loaded
    for(const it of readingPlan){
      await ensureReadingLoaded(it);
    }
    // Listening: load all planned sets (max 5) for review if not loaded
    for(const entry of listeningPlan){
      await ensureListeningLoaded(entry);
    }
  }

  async function renderDone(){
    await ensureReviewDataLoaded();
    const sc = computeScores();

    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">채점 완료!</div>
        <div class="muted">Reading ${sc.rOk}/${sc.rTot} · Listening ${sc.lOk}/${sc.lTot} · Total ${sc.totalOk}/${sc.totalTot}</div>
        <div style="height:12px"></div>
        <div class="row">
          <button class="btn" id="btnReview">리뷰 보기</button>
          <button class="btn secondary" id="btnRestart">다시하기</button>
          <button class="btn secondary" id="btnClose">닫기</button>
        </div>
        <div class="muted small" style="margin-top:12px">※ 리뷰에서는 정답/선택답을 같이 보여줘.</div>
      </div>

      <div id="review" class="hidden"></div>
    `;

    $('#btnRestart').onclick = ()=> location.reload();
    $('#btnClose').onclick = ()=> window.close();
    $('#btnReview').onclick = ()=>{
      const box = $('#review');
      box.classList.remove('hidden');
      box.innerHTML = renderReviewHtml();
      $('#btnHideReview').onclick = ()=> box.classList.add('hidden');
      bindReviewAudioButtons();
    };
  }

  function renderReviewHtml(){
    // Reading
    const readingBlocks = readingPlan.map(it=>{
      const data = readingCache.get(it.file);
      const qs = readingFilteredQs.get(it.file) || [];
      const ok = qs.filter(q => {
        const sel = getReadingAnswer(it.file, q.num);
        return sel && q.correct && sel === q.correct;
      }).length;
      const rows = qs.map(q=>{
        const sel = getReadingAnswer(it.file, q.num);
        const cls = !sel ? 'muted' : (sel === q.correct ? 'good' : 'bad');
        return `
          <div class="review-q ${cls}">
            <div class="row" style="justify-content:space-between;gap:10px">
              <div><b>Q${q.num}</b> <span class="muted small">${escape(q.type||'')}</span></div>
              <div class="muted small">선택: <b>${sel||'-'}</b> · 정답: <b>${q.correct||'-'}</b></div>
            </div>
            <div class="muted small" style="margin-top:6px">${escapeMultiline(q.prompt)}</div>
          </div>
        `;
      }).join('');

      return `
        <details class="review-block">
          <summary>
            <b>Reading</b> · ${escape(it.title||data?.title||it.file)}
            <span class="muted small" style="margin-left:8px">${ok}/${qs.length}</span>
          </summary>
          <div class="review-body">
            <div class="grid2">
              <section class="panel">
                <div class="panel-head"><div class="panel-title">Passage</div></div>
                <div class="panel-body">${renderPassageHtml(data?.passage||'')}</div>
              </section>
              <section class="panel">
                <div class="panel-head"><div class="panel-title">Questions</div></div>
                <div class="panel-body">${rows || '<div class="muted">(문항 없음)</div>'}</div>
              </section>
            </div>
          </div>
        </details>
      `;
    }).join('');

    // Listening
    const listeningBlocks = listeningPlan.map(entry=>{
      const base = listeningCache.get(entry.set);
      const nums = listeningSubsetNums.get(entry.set) || [];
      const qs = (base?.questions || []).filter(q=>nums.includes(q.num)).sort((a,b)=>a.num-b.num);
      const ok = qs.filter(q=>{
        const sel = getListeningAnswer(entry.set, q.num);
        return sel && q.correct && sel === q.correct;
      }).length;

      const qRows = qs.map(q=>{
        const sel = getListeningAnswer(entry.set, q.num);
        const cls = !sel ? 'muted' : (sel === q.correct ? 'good' : 'bad');
        return `
          <div class="review-q ${cls}">
            <div class="row" style="justify-content:space-between;gap:10px">
              <div><b>Q${q.num}</b> <span class="muted small">${escape(q.type||'')}</span></div>
              <div class="muted small">선택: <b>${sel||'-'}</b> · 정답: <b>${q.correct||'-'}</b></div>
            </div>
            <div class="muted small" style="margin-top:6px">${escapeMultiline(q.prompt)}</div>
            ${q.explain ? `<div class="muted small" style="margin-top:6px">해설: ${escape(q.explain)}</div>`:''}
            <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
              <button class="btn secondary" data-play-main="${escape(entry.path)}">Main 재생</button>
              <button class="btn secondary" data-play-q="${escape(entry.path)}" data-qnum="${q.num}">Q${q.num} 재생</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <details class="review-block">
          <summary>
            <b>Listening</b> · ${escape(entry.format||'')} · ${escape(entry.main_topic||entry.scenario||'')}
            <span class="muted small" style="margin-left:8px">${ok}/${qs.length}</span>
          </summary>
          <div class="review-body">
            <div class="grid2">
              <section class="panel">
                <div class="panel-head"><div class="panel-title">Script</div></div>
                <div class="panel-body"><pre class="script" data-script-path="${escape(entry.path)}">(불러오는 중...)</pre></div>
              </section>
              <section class="panel">
                <div class="panel-head"><div class="panel-title">Questions</div></div>
                <div class="panel-body">${qRows || '<div class="muted">(문항 없음)</div>'}</div>
              </section>
            </div>
          </div>
        </details>
      `;
    }).join('');

    return `
      <div class="hero-card" style="margin-top:14px">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="kicker">리뷰</div>
            <div class="muted small">(summary 클릭해서 펼쳐봐)</div>
          </div>
          <button class="btn" id="btnHideReview">닫기</button>
        </div>
      </div>

      ${readingBlocks}
      ${listeningBlocks}
    `;
  }

  function bindReviewAudioButtons(){
    // load scripts lazily
    $$('pre[data-script-path]').forEach(async (pre)=>{
      const path = pre.getAttribute('data-script-path');
      try{
        const res = await fetch(fileUrl(`${path}/script.txt`), {cache:'no-store', credentials:'include'});
        if(!res.ok) throw new Error('no script');
        const txt = await res.text();
        pre.textContent = txt;
      }catch(e){
        pre.textContent = '(script.txt 없음)';
      }
    });

    $$('button[data-play-main]').forEach(btn=>{
      btn.onclick = ()=>{
        const path = btn.getAttribute('data-play-main');
        play(fileUrl(`${path}/listening.mp3`));
      };
    });
    $$('button[data-play-q]').forEach(btn=>{
      btn.onclick = ()=>{
        const path = btn.getAttribute('data-play-q');
        const qnum = Number(btn.getAttribute('data-qnum')||0);
        play(fileUrl(`${path}/questions_q${String(qnum).padStart(2,'0')}.mp3`));
      };
    });
  }

  function injectListeningIllustrationCSS(){
    if(document.getElementById('listenIlluStyle')) return;
    const style = document.createElement('style');
    style.id = 'listenIlluStyle';
    style.textContent = `
      .listen-figure{position:relative;height:240px}
      .listen-board{
        position:absolute; left:40px; right:40px; top:22px; height:140px;
        background:#5aa55a; border-radius:10px;
        box-shadow: inset 0 0 0 6px rgba(255,255,255,.08);
      }
      .listen-avatar{
        position:absolute; left:50%; top:80px; transform:translateX(-50%);
        width:86px; height:150px;
        border-radius:18px;
        background: linear-gradient(#3a3a44, #3a3a44) 50% 20%/60px 60px no-repeat,
                    radial-gradient(circle at 50% 18%, #333 0 33px, transparent 34px),
                    radial-gradient(circle at 50% 40%, #f1c7a8 0 36px, transparent 37px),
                    linear-gradient(#ffffff, #ffffff) 50% 78%/86px 70px no-repeat,
                    linear-gradient(#d9d9e3, #d9d9e3) 50% 96%/86px 32px no-repeat;
      }

      /* review helpers */
      .review-block{margin:12px 0}
      .review-block > summary{cursor:pointer; padding:12px 14px; border-radius:14px; background:rgba(0,0,0,.04)}
      .sim body .review-block > summary{background:rgba(0,0,0,.04)}
      .review-body{margin-top:10px}
      .review-q{padding:10px; border-radius:12px; background:rgba(0,0,0,.035); margin-bottom:10px}
      .review-q.good{background:rgba(0,128,0,.08)}
      .review-q.bad{background:rgba(180,0,0,.08)}
      pre.script{white-space:pre-wrap; margin:0; line-height:1.5}
    `;
    document.head.appendChild(style);
  }

  function renderError(e){
    main.innerHTML = `<div class="hero-card"><div class="kicker">에러</div><div class="muted">${escape(String(e?.message||e))}</div></div>`;
  }

  // ---------- init ----------
  async function init(){
    // 1) Session 안내 (짧게)
    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">Simulation Test</div>
        <div class="muted" style="margin-top:6px">실전처럼 진행돼. 아래 내용 확인하고 시작해줘.</div>
        <ul class="muted small" style="margin:10px 0 0 18px; line-height:1.65">
          <li>시간 고정: Reading 36:00 · Listening 41:00</li>
          <li>Listening은 오디오 재생 중 문제를 보여주지 않음</li>
          <li>Listening은 오디오가 끝나면 자동으로 다음으로 넘어감</li>
          <li>끝나면 채점 결과 + 리뷰 제공</li>
        </ul>
        <div style="height:14px"></div>
        <button class="btn" id="btnBegin">시작</button>
        <div class="muted small" style="margin-top:10px">※ 팝업 창을 닫으면 시험이 종료돼.</div>
      </div>
    `;
    await new Promise(resolve=>{
      const b = document.getElementById('btnBegin');
      if(!b) return resolve();
      b.onclick = ()=> resolve();
    });

    // 2) 3초 "시험 준비중" 화면
    const t0 = Date.now();
    main.innerHTML = `
      <div class="hero-card center">
        <div class="kicker">시험 준비중</div>
        <div class="muted">잠시만…</div>
        <div class="prep-count" id="prepCount">3</div>
      </div>
    `;
    let n = 3;
    const el = document.getElementById('prepCount');
    const iv = setInterval(()=>{
      n = Math.max(1, n-1);
      if(el) el.textContent = String(n);
      if(n <= 1) clearInterval(iv);
    }, 1000);

    // 인덱스 로딩 병렬
    const rP = getReadingIndex();
    const lP = getListeningIndex();

    const rIdx = await rP;
    readingPlan = pickRandom(rIdx, SIM.readingPassages);

    const lIdx = await lP;
    const isLecture = (x)=> (x.format||'').toLowerCase().includes('lecture');
    const lectures = lIdx.filter(isLecture);
    const convs = lIdx.filter(x => !isLecture(x));
    const pickedLecture = pickRandom(lectures, SIM.listeningLecture);
    const pickedConv = pickRandom(convs, SIM.listeningConv);

    function shuffle(arr){
      const a = arr.slice();
      for(let i=a.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        const tmp = a[i]; a[i]=a[j]; a[j]=tmp;
      }
      return a;
    }
    function mixPlans(){
      let a = shuffle([...pickedLecture, ...pickedConv]);
      if(a.length >= 5 && a.slice(0,3).every(isLecture)){
        const idx = a.findIndex((x, k)=> k>=3 && !isLecture(x));
        if(idx !== -1){
          const tmp = a[2]; a[2]=a[idx]; a[idx]=tmp;
        }
      }
      return a;
    }
    listeningPlan = mixPlans();

    const elapsed = Date.now() - t0;
    if(elapsed < 3000){ await new Promise(r=>setTimeout(r, 3000 - elapsed)); }

    section = 'reading';
    startSectionTimer(SIM.readingTimeSec);
    await startReading();
  }

  window.addEventListener('beforeunload', ()=>{
    stopAllTimers();
    try{ audio.pause(); }catch(e){}
  });

  init().catch(renderError);

})();
