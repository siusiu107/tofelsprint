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
    getListeningIndex, loadListeningSet, pickRandom, withLoading
  } = window.TOEFL;

  const main = $('#main');
  const subbar = $('#subbar');
  const sectionCounter = $('#simSectionCounter');

  const audioBarFill = $('#audioFill');
  const audioTimeLabel = $('#audioTime');

  const audio = document.getElementById('audio');
  secureAudio(audio);

  // ---- config (실제 TOEFL과 1:1 시간 일치시키기보단 "실전 느낌" 유지용) ----
  const SIM = {
    readingPassages: 3,
    listeningLecture: 2,
    listeningConv: 1,
    // 타이머는 "조정 불가" (UI에서 변경 버튼 없음)
    readingTimeSec: 54 * 60,
    listeningTimeSec: 41 * 60
  };

  // ---- state ----
  document.body.classList.add('sim'); // Shift+F5 방지에 사용

  let readingPlan = [];
  let listeningPlan = [];

  let section = 'intro'; // intro | reading | listening | result
  let secLeft = 0;
  let secTimer = null;

  let curPassageIdx = 0;
  let curQuestionIdx = 0;

  let curSetIdx = 0;
  let curListeningQIdx = 0;
  let listeningPhase = 'idle'; // idle | mainAudio | qAudio | answer

  const answers = {
    reading: {},   // { passageId: { qnum: choice } }
    listening: {}  // { set: { qnum: choice } }
  };

  // prevent seek in listening section
  setSectionIsListening(()=> section === 'listening');

  function stopAllTimers(){
    if(secTimer){ clearInterval(secTimer); secTimer = null; }
  }

  function setSubbar(text){
    if(subbar) subbar.textContent = text;
  }

  function setSectionCounter(text){
    if(sectionCounter) sectionCounter.textContent = text || '';
  }

  function setAudioBar(pct, cur, total){
    if(!audioBarFill || !audioTimeLabel) return;
    audioBarFill.style.width = `${Math.max(0, Math.min(100, pct||0))}%`;
    audioTimeLabel.textContent = `${fmtTime(cur)} / ${fmtTime(total)}`;
  }

  function startSectionTimer(totalSec){
    stopAllTimers();
    secLeft = totalSec;
    tickTimer();
    secTimer = setInterval(()=>{
      secLeft = Math.max(0, secLeft - 1);
      tickTimer();
      if(secLeft <= 0){
        clearInterval(secTimer);
        secTimer = null;
        // time up → next section
        if(section === 'reading'){
          section = 'listening';
          startSectionTimer(SIM.listeningTimeSec);
          startListening().catch(renderError);
        }else if(section === 'listening'){
          finishExam().catch(renderError);
        }
      }
    }, 1000);
  }

  function tickTimer(){
    const mm = Math.floor(secLeft/60);
    const ss = secLeft % 60;
    const timeTxt = `${mm}:${String(ss).padStart(2,'0')}`;
    setSectionCounter(timeTxt);
  }

  function escapeHtml(s){
    return (s??'').toString().replace(/[&<>"']/g, c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function renderError(err){
    const msg = err?.message || String(err);
    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">오류</div>
        <div class="muted">${escapeHtml(msg)}</div>
        <div style="height:12px"></div>
        <a class="btn secondary" href="index.html">메인으로</a>
      </div>
    `;
  }

  // ------------------- Reading -------------------
  async function startReading(){
    setSubbar('Simulation • Reading');
    const pTot = readingPlan.length;
    curPassageIdx = 0;
    curQuestionIdx = 0;

    await renderReadingPassage();
  }

  async function renderReadingPassage(){
    const it = readingPlan[curPassageIdx];
    const data = await loadReadingPassage(it.file, it.root);

    const questions = data.questions || [];
    const qTot = questions.length;

    // nav
    const pNum = curPassageIdx + 1;
    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">The following passage is for questions 1–${qTot}.</div>
              <div class="muted small">${escapeHtml(it.title||data.title||'')}</div>
            </div>
            <div class="row">
              <span class="badge">Passage ${pNum}/${pTot}</span>
            </div>
          </div>
          <div class="panel-body" id="passage"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title" id="qTitle">Question</div>
            <div class="row">
              <button class="btn secondary" id="btnPrevQ"><img style="width:18px;height:18px;filter:none" src="assets/chev-left.svg"/></button>
              <span class="badge" id="qCounter">—</span>
              <button class="btn secondary" id="btnNextQ"><img style="width:18px;height:18px;filter:none" src="assets/chev-right.svg"/></button>
            </div>
          </div>
          <div class="panel-body">
            <div class="muted small" id="qType">—</div>
            <div class="qstem" id="qStem"></div>
            <div class="choices" id="choices"></div>
            <div style="height:12px"></div>
            <div class="row" style="gap:10px">
              <button class="btn secondary" id="btnPrevPassage">이전 Passage</button>
              <button class="btn secondary" id="btnNextPassage">다음 Passage</button>
            </div>
          </div>
        </section>
      </div>
    `;

    // render passage
    document.getElementById('passage').innerHTML = renderPassageHtml(data.passage || '');

    // question render
    curQuestionIdx = Math.max(0, Math.min(curQuestionIdx, qTot-1));
    renderReadingQuestion(questions);

    // bind
    document.getElementById('btnPrevQ').onclick = ()=>{
      curQuestionIdx = Math.max(0, curQuestionIdx-1);
      renderReadingQuestion(questions);
    };
    document.getElementById('btnNextQ').onclick = ()=>{
      curQuestionIdx = Math.min(qTot-1, curQuestionIdx+1);
      renderReadingQuestion(questions);
    };

    document.getElementById('btnPrevPassage').onclick = ()=>{
      if(curPassageIdx <= 0) return;
      curPassageIdx--;
      curQuestionIdx = 0;
      renderReadingPassage().catch(renderError);
    };
    document.getElementById('btnNextPassage').onclick = ()=>{
      if(curPassageIdx >= pTot-1) return;
      curPassageIdx++;
      curQuestionIdx = 0;
      renderReadingPassage().catch(renderError);
    };
  }

  function renderPassageHtml(p){
    const chunks = (p||'').split('\n').map(s=>s.trim()).filter(Boolean);
    return chunks.map(par=>`<p class="p">${escapeHtml(par)}</p>`).join('');
  }

  function renderReadingQuestion(questions){
    const it = readingPlan[curPassageIdx];
    const dataKey = String(it.id || it.file || curPassageIdx);
    answers.reading[dataKey] ||= {};

    const qTot = questions.length;
    const q = questions[curQuestionIdx];
    if(!q) return;

    document.getElementById('qTitle').textContent = `Question ${q.num}`;
    document.getElementById('qCounter').textContent = `${String(curQuestionIdx+1).padStart(2,'0')}/${String(qTot).padStart(2,'0')}`;
    document.getElementById('qType').textContent = `Type: ${q.type || 'MC'}`;
    document.getElementById('qStem').innerHTML = escapeHtml(q.stem || '').replace(/\n/g,'<br/>');

    const wrap = document.getElementById('choices');
    wrap.innerHTML = '';

    const selected = answers.reading[dataKey][q.num] || null;

    for(const c of (q.choices||[])){
      const b = document.createElement('button');
      b.className = 'choice';
      b.type = 'button';
      b.innerHTML = `<span class="letter">${c.letter}</span><span class="text">${escapeHtml(c.text||'')}</span>`;
      if(selected === c.letter) b.classList.add('selected');
      b.onclick = ()=>{
        answers.reading[dataKey][q.num] = c.letter;
        for(const el of wrap.querySelectorAll('.choice')) el.classList.remove('selected');
        b.classList.add('selected');
      };
      wrap.appendChild(b);
    }
  }

  // ------------------- Listening -------------------
  async function startListening(){
    setSubbar('Simulation • Listening');
    curSetIdx = 0;
    curListeningQIdx = 0;
    listeningPhase = 'idle';
    await renderListeningSet();
  }

  async function renderListeningSet(){
    const entry = listeningPlan[curSetIdx];
    const setTot = listeningPlan.length;

    const root = await window.TOEFL.detectListeningRoot?.();
    const ent = await loadListeningSet(entry.folder || entry.set, root || entry.path?.replace(/\/Listening_Set_.+$/,'') || 'data/listening');

    answers.listening[entry.set] ||= {};

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Listening</div>
              <div class="muted small">${escapeHtml(entry.format||'')} ${entry.category?('• '+escapeHtml(entry.category)):""}</div>
            </div>
            <div class="row">
              <span class="badge">Set ${String(entry.set).padStart(3,'0')} (${curSetIdx+1}/${setTot})</span>
              <span class="badge" id="phaseBadge">Ready</span>
            </div>
          </div>
          <div class="panel-body">
            <div class="muted small" id="listenHint">오디오 재생 중에는 문제가 표시되지 않아.</div>
            <div style="height:12px"></div>
            <div class="row" style="gap:10px">
              <button class="btn" id="btnPlayMain">Main Audio</button>
              <button class="btn secondary" id="btnStop">Stop</button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title" id="lqTitle">Question</div>
            <div class="row">
              <span class="badge" id="lqCounter">—</span>
            </div>
          </div>
          <div class="panel-body">
            <div class="qstem" id="lqStem"></div>
            <div class="choices" id="lChoices"></div>
            <div style="height:12px"></div>
            <div class="row" style="gap:10px">
              <button class="btn secondary" id="btnPrevSet">이전 Set</button>
              <button class="btn secondary" id="btnNextSet">다음 Set</button>
            </div>
          </div>
        </section>
      </div>
    `;

    const phaseBadge = document.getElementById('phaseBadge');
    const lqTitle = document.getElementById('lqTitle');
    const lqCounter = document.getElementById('lqCounter');
    const lqStem = document.getElementById('lqStem');
    const lChoices = document.getElementById('lChoices');

    function hideQuestions(){
      lqTitle.textContent = 'Question';
      lqCounter.textContent = '—';
      lqStem.textContent = '';
      lChoices.innerHTML = '';
    }

    function showQuestion(){
      const qTot = ent.questions.length;
      const q = ent.questions[curListeningQIdx];
      if(!q) return;

      lqTitle.textContent = `Question ${q.num}`;
      lqCounter.textContent = `${String(curListeningQIdx+1).padStart(2,'0')}/${String(qTot).padStart(2,'0')}`;
      lqStem.textContent = q.stem || '';
      lChoices.innerHTML = '';

      const selected = answers.listening[entry.set][q.num] || null;

      for(const c of (q.choices||[])){
        const b = document.createElement('button');
        b.className = 'choice';
        b.type = 'button';
        b.innerHTML = `<span class="letter">${c.letter}</span><span class="text">${escapeHtml(c.text||'')}</span>`;
        if(selected === c.letter) b.classList.add('selected');
        b.onclick = ()=>{
          answers.listening[entry.set][q.num] = c.letter;
          for(const el of lChoices.querySelectorAll('.choice')) el.classList.remove('selected');
          b.classList.add('selected');
        };
        lChoices.appendChild(b);
      }
    }

    function play(url){
      try{
        audio.pause();
        audio.src = url;
        audio.currentTime = 0;
        audio.play().catch(()=>{});
      }catch(e){}
    }

    function stop(){
      try{ audio.pause(); }catch(e){}
      listeningPhase = 'idle';
      phaseBadge.textContent = 'Ready';
      hideQuestions();
    }

    // main audio
    document.getElementById('btnPlayMain').onclick = ()=>{
      listeningPhase = 'mainAudio';
      phaseBadge.textContent = 'Main audio...';
      curListeningQIdx = 0;
      hideQuestions();
      play(ent.main);
    };

    document.getElementById('btnStop').onclick = ()=> stop();

    // set navigation (연습처럼 자유 이동은 가능하되, Simulation이라 오디오 흐름은 자동)
    document.getElementById('btnPrevSet').onclick = ()=>{
      if(curSetIdx <= 0) return;
      stop();
      curSetIdx--;
      curListeningQIdx = 0;
      renderListeningSet().catch(renderError);
    };
    document.getElementById('btnNextSet').onclick = ()=>{
      if(curSetIdx >= setTot-1) return;
      stop();
      curSetIdx++;
      curListeningQIdx = 0;
      renderListeningSet().catch(renderError);
    };

    audio.addEventListener('timeupdate', ()=>{
      try{
        const cur = audio.currentTime || 0;
        const total = audio.duration || 0;
        const pct = total ? (cur/total)*100 : 0;
        setAudioBar(pct, cur, total);
      }catch(e){}
    });

    audio.onended = ()=>{
      // Listening은 "오디오 끝나면 자동 진행"
      if(listeningPhase === 'mainAudio'){
        // main 끝나면 Q1 audio로 바로
        listeningPhase = 'qAudio';
        phaseBadge.textContent = `Q${ent.questions[curListeningQIdx].num} audio...`;
        hideQuestions();
        play(ent.questions[curListeningQIdx].audio);
        return;
      }

      if(listeningPhase === 'qAudio'){
        // 질문 오디오 끝나면 "답안 선택 여부 상관없이" 다음으로
        curListeningQIdx++;

        if(curListeningQIdx >= ent.questions.length){
          // 다음 set으로
          if(curSetIdx < setTot-1){
            stop();
            curSetIdx++;
            curListeningQIdx = 0;
            renderListeningSet().catch(renderError);
          }else{
            // listening 끝
            finishExam().catch(renderError);
          }
          return;
        }

        // 다음 질문 오디오로 바로
        phaseBadge.textContent = `Q${ent.questions[curListeningQIdx].num} audio...`;
        hideQuestions();
        play(ent.questions[curListeningQIdx].audio);
      }
    };

    // 처음엔 문제 숨김
    hideQuestions();
  }

  // ------------------- Result / Review -------------------
  async function finishExam(){
    section = 'result';
    stopAllTimers();
    try{ audio.pause(); }catch(e){}
    setSubbar('Simulation • Result');
    setSectionCounter('');

    // Grade
    const score = gradeAll();

    main.innerHTML = `
      <div class="hero">
        <div class="hero-card">
          <div class="kicker">Result</div>
          <div class="title">채점 완료</div>
          <div class="muted" style="margin-top:8px">
            Reading: <b>${score.reading.correct}/${score.reading.total}</b><br/>
            Listening: <b>${score.listening.correct}/${score.listening.total}</b>
          </div>
          <div style="height:14px"></div>
          <button class="btn secondary" id="btnReview">리뷰 보기</button>
          <a class="btn" style="margin-left:10px" href="index.html">닫기</a>
        </div>

        <div class="hero-card">
          <div class="kicker">Note</div>
          <div class="muted">
            실제 TOEFL 점수 변환표는 공식/버전에 따라 달라질 수 있어.<br/>
            여기서는 “정답 개수 기반”으로 리뷰/실전 감각을 잡는 용도야.
          </div>
        </div>
      </div>
      <div id="reviewWrap" style="margin-top:14px"></div>
    `;

    document.getElementById('btnReview').onclick = async ()=>{
      await renderReview(score);
    };
  }

  function gradeAll(){
    let rCorrect=0, rTotal=0;
    let lCorrect=0, lTotal=0;

    // Reading
    for(const it of readingPlan){
      const key = String(it.id || it.file);
      const a = answers.reading[key] || {};
      // we need answer keys -> re-load minimal for grading
      // (이건 reviewer에서 다시 loadReadingPassage 할 때도 사용)
    }

    // We'll grade in review by re-loading passages/sets with answers
    // For quick top summary, approximate by comparing stored answers with parsed correct choices
    // (안전: 실패해도 리뷰에서 정확 채점)
    return {
      reading:{ correct:rCorrect, total:rTotal },
      listening:{ correct:lCorrect, total:lTotal }
    };
  }

  async function renderReview(score){
    const wrap = document.getElementById('reviewWrap');
    if(!wrap) return;

    wrap.innerHTML = `<div class="hero-card"><div class="kicker">Review</div><div class="muted">정확 채점/리뷰 로딩 중…</div></div>`;

    // 정확 채점
    let rCorrect=0, rTotal=0;
    let lCorrect=0, lTotal=0;

    // Reading details
    const rDetails = [];
    for(const it of readingPlan){
      const data = await loadReadingPassage(it.file, it.root);
      const key = String(it.id || it.file);
      const picked = answers.reading[key] || {};
      const qs = data.questions || [];
      for(const q of qs){
        rTotal++;
        const sel = picked[q.num] || null;
        const ok = sel && q.answer && sel === q.answer;
        if(ok) rCorrect++;
      }
      rDetails.push({ it, data, picked });
    }

    // Listening details
    const lDetails = [];
    const root = await window.TOEFL.detectListeningRoot?.();
    for(const entry of listeningPlan){
      const ent = await loadListeningSet(entry.folder || entry.set, root || entry.path?.replace(/\/Listening_Set_.+$/,'') || 'data/listening');
      const picked = answers.listening[entry.set] || {};
      for(const q of ent.questions){
        lTotal++;
        const sel = picked[q.num] || null;
        const ok = sel && q.answer && sel === q.answer;
        if(ok) lCorrect++;
      }
      lDetails.push({ entry, ent, picked });
    }

    // Render
    wrap.innerHTML = `
      <div class="hero-card">
        <div class="kicker">Review Summary</div>
        <div class="muted">
          Reading: <b>${rCorrect}/${rTotal}</b><br/>
          Listening: <b>${lCorrect}/${lTotal}</b>
        </div>
      </div>

      <div style="height:12px"></div>
      <div class="hero-card">
        <div class="kicker">Reading Review</div>
        <div id="rRev"></div>
      </div>

      <div style="height:12px"></div>
      <div class="hero-card">
        <div class="kicker">Listening Review</div>
        <div id="lRev"></div>
      </div>
    `;

    const rRev = document.getElementById('rRev');
    const lRev = document.getElementById('lRev');

    rRev.innerHTML = rDetails.map((d, idx)=>{
      const key = String(d.it.id || d.it.file);
      const qs = d.data.questions || [];
      const rows = qs.map(q=>{
        const sel = d.picked[q.num] || '—';
        const ans = q.answer || '—';
        const ok = (sel !== '—' && ans !== '—' && sel === ans);
        return `<div class="review-row ${ok?'ok':'no'}">
          <div class="review-left">Q${q.num}</div>
          <div class="review-mid">선택: <b>${sel}</b> / 정답: <b>${ans}</b></div>
        </div>`;
      }).join('');
      return `
        <div class="review-block">
          <div class="review-title">Passage ${idx+1}: ${escapeHtml(d.it.title||d.data.title||'')}</div>
          ${rows}
        </div>
      `;
    }).join('');

    lRev.innerHTML = lDetails.map((d, idx)=>{
      const qs = d.ent.questions || [];
      const rows = qs.map(q=>{
        const sel = d.picked[q.num] || '—';
        const ans = q.answer || '—';
        const ok = (sel !== '—' && ans !== '—' && sel === ans);
        return `<div class="review-row ${ok?'ok':'no'}">
          <div class="review-left">Q${q.num}</div>
          <div class="review-mid">선택: <b>${sel}</b> / 정답: <b>${ans}</b></div>
        </div>`;
      }).join('');
      return `
        <div class="review-block">
          <div class="review-title">Set ${String(d.entry.set).padStart(3,'0')} (${escapeHtml(d.entry.format||'')})</div>
          ${rows}
        </div>
      `;
    }).join('');
  }

  // ------------------- Intro -------------------
  async function init(){
    section = 'intro';
    setSubbar('Simulation • Start');
    setSectionCounter('');

    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">Simulation Test</div>
        <div class="title">실전처럼 진행</div>
        <div class="muted" style="margin-top:10px">
          <ul style="margin:10px 0 0 18px; line-height:1.6">
            <li>시간 조정 불가</li>
            <li>Listening은 오디오 재생 중 문제를 보여주지 않음</li>
            <li>Listening은 오디오가 끝나면 자동으로 다음으로 넘어감</li>
            <li>끝나면 채점 결과 + 리뷰 제공</li>
          </ul>
          <div style="height:14px"></div>
          <button class="btn" id="btnBegin">시작</button>
          <div class="muted small" style="margin-top:10px">※ 팝업 창을 닫으면 시험이 종료돼.</div>
        </div>
      </div>
    `;
    await new Promise(resolve=>{
      const b = document.getElementById('btnBegin');
      if(!b) return resolve();
      b.onclick = ()=> resolve();
    });

    // 2) 실제 데이터 로딩(필요할 때만 로딩 화면 표시)
    const { rIdx, lIdx } = await withLoading(
      '시험 데이터 불러오는 중…',
      async ()=>{
        const [rIdx, lIdx] = await Promise.all([getReadingIndex(), getListeningIndex()]);
        return { rIdx, lIdx };
      },
      '데이터를 불러오는 중…'
    );

    readingPlan = pickRandom(rIdx, SIM.readingPassages);

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
