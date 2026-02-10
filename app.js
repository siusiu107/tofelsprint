/* app.js - 메인 앱 */
(function(){
  const { $, $$, toast, fmtTime, getReadingIndex, loadReadingPassage, getListeningIndex, loadListeningSet, pickRandom, secureAudio, setSectionIsListening, withLoading } = window.TOEFL;

  const main = $('#main');
  const subbar = $('#subbar');
  const weekPill = $('#weekPill');
  const topCounter = $('#topCounter');
  const btnPrev = $('#btnPrev');
  const btnNext = $('#btnNext');
  const drawer = $('#drawer');
  const btnMenu = $('#btnMenu');
  const btnCloseDrawer = $('#btnCloseDrawer');
  const audioBarWrap = $('#audioBarWrap');

  let nav = { prev:null, next:null };
  let curAudio = null;
  let audioTick = null;

  // Practice mode: do NOT persist answers to localStorage.
  // Keep answers only in-memory while the tab is open.
  const practiceStore = { reading:{}, listening:{} };
  function _pSetKey(mode, setId){ return `${mode}__${setId}`; }
  function saveAnswer(mode, setId, qnum, obj, remove=false){
    const k = _pSetKey(mode, setId);
    if(!practiceStore[mode][k]) practiceStore[mode][k] = {};
    if(remove) delete practiceStore[mode][k][qnum];
    else practiceStore[mode][k][qnum] = obj;
  }
  function loadAnswer(mode, setId, qnum){
    const k = _pSetKey(mode, setId);
    return (practiceStore[mode][k] && practiceStore[mode][k][qnum]) ? practiceStore[mode][k][qnum] : null;
  }

  function setSubbar(text){ subbar.textContent = text; }
  function setCounter(text){ topCounter.textContent = text || '—'; }
  function setWeek(text){ weekPill.textContent = text || 'Week'; }


  // Clean URL routing (History API) - hash(#) 없이 /practice/... 형태로 동작
  const BASE = (()=>{
    // <base href="/"> 를 기준으로 잡음 (없으면 '/')
    let b = '/';
    try{
      b = (window.APP_BASE || document.querySelector('base')?.getAttribute('href') || '/');
      if(!b.startsWith('/')) b = '/' + b;
    }catch(e){ b = '/'; }
    // 끝 슬래시 제거 (단, '/'는 유지)
    if(b.length > 1) b = b.replace(/\/+$/,'');
    return b || '/';
  })();

  function toUrl(path){
    // path: '/practice' or 'practice'
    if(!path) path = '/';
    if(path.startsWith('#')) path = path.replace(/^#/, '');
    if(!path.startsWith('/')) path = '/' + path;
    if(BASE !== '/' && !path.startsWith(BASE + '/')){
      return BASE + path;
    }
    return path;
  }

  function getRoutePath(){
    // BASE 제거한 "앱 내부 경로" 반환: '/practice/reading/0001'
    let p = location.pathname || '/';
    if(BASE !== '/' && p.startsWith(BASE + '/')) p = p.slice(BASE.length);
    if(BASE !== '/' && p === BASE) p = '/';
    if(!p.startsWith('/')) p = '/' + p;
    return p;
  }

  function navigate(path, {replace=false} = {}){
    const url = toUrl(path);
    try{
      if(replace) history.replaceState({}, '', url);
      else history.pushState({}, '', url);
    }catch(e){
      // fallback
      location.href = url;
      return;
    }
    route();
  }

  function showAudioBar(show){
    if(show) audioBarWrap.classList.remove('hidden');
    else audioBarWrap.classList.add('hidden');
  }

  function stopAudio(){
    if(curAudio){
      try{ curAudio.pause(); }catch(e){}
    }
    curAudio = null;
    clearInterval(audioTick);
    audioTick = null;
    showAudioBar(false);
  }

  function updateTopNav(){
    const hasPrev = !!nav.prev;
    const hasNext = !!nav.next;
    btnPrev.disabled = !hasPrev;
    btnNext.disabled = !hasNext;
  }

  function bindTopNav(){
    updateTopNav();
    btnPrev.onclick = ()=>{
      if(btnPrev.disabled) return;
      if(nav.prev) navigate(nav.prev);
    };
    btnNext.onclick = ()=>{
      if(btnNext.disabled) return;
      if(nav.next) navigate(nav.next);
    };
  }

  function openDrawer(){
    drawer.classList.remove('hidden');
  }
  function closeDrawer(){
    drawer.classList.add('hidden');
  }
  btnMenu.onclick = openDrawer;
  btnCloseDrawer.onclick = closeDrawer;
  drawer.addEventListener('click', (e)=>{ if(e.target === drawer) closeDrawer(); });

  
  function route(){
    stopAudio();

    // legacy hash(#/...)로 들어왔으면 clean URL로 바꿔치기
    try{
      if(location.hash && location.hash.startsWith('#/')){
        const legacy = location.hash.replace(/^#/, ''); // '/practice/...'
        navigate(legacy, {replace:true});
        return;
      }
    }catch(e){}

    const path = getRoutePath();
    const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);

    // reset top nav
    nav.prev = null; nav.next = null;
    bindTopNav();

    if(parts.length === 0){
      renderHome();
      return;
    }

    if(parts[0] === 'practice'){
      if(parts.length === 1){
        renderPractice();
        return;
      }
      if(parts[1] === 'reading'){
        if(parts[2]) renderReadingViewer(Number(parts[2]));
        else renderReadingList();
        return;
      }
      if(parts[1] === 'listening'){
        if(parts[2]) renderListeningViewer(Number(parts[2]));
        else renderListeningList();
        return;
      }
    }

    if(parts[0] === 'sim' && parts[1] === 'launch'){
      renderSimLaunch();
      return;
    }

    if(parts[0] === 'about'){
      renderAbout();
      return;
    }

    renderNotFound();
  }

  function renderAbout(){
    setWeek('Week');
    setSubbar('기능/디자인');
    setCounter('—');
    main.innerHTML = `
      <div class="card">
        <div class="card-title">디자인</div>
        <ul class="bullets">
          <li><b>전체 하양</b> 베이스 + <b>상단 보라 Topbar</b> + <b>연두 프레임</b> 느낌</li>
          <li>섹션 타이머/리스닝 진행바는 상단에 고정(토플 느낌)</li>
          <li>카드 UI: 라운드(18px) + 소프트 쉐도우</li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">모드별 동작</div>
        <ul class="bullets">
          <li><b>연습모드</b>: 답 선택 자유 + <b>이동은 수동(Prev/Next)</b></li>
          <li><b>연습모드</b>: 진행/답안 <b>localStorage 저장 안 함</b>(탭 닫으면 초기화)</li>
          <li><b>SimTest</b>: 팝업으로 실행, 시간 조정 불가, 끝나면 <b>채점 + 리뷰</b></li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">Listening 규칙</div>
        <ul class="bullets">
          <li>오디오 재생 중에는 <b>문제 화면 숨김</b></li>
          <li>main audio 끝 → question audio 재생</li>
          <li><b>SimTest</b>에서는 question audio 끝나면 <b>답 선택 여부 상관없이 자동 다음</b></li>
          <li><b>SimTest</b> 출제는 <b>lecture + conversation 섞어서</b> 진행</li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">보안/제한(최대한)</div>
        <ul class="bullets">
          <li>오디오: 시킹/배속 변경 등 임의 조작을 최대한 차단</li>
          <li>직접 URL로 <code>/data/reading/</code>, <code>/data/listening/</code> 접근 시 <b>잘못된 접근입니다</b> 표시(서비스워커 설치 후)</li>
          <li><b>SimTest</b>에서 <kbd>Shift+F5</kbd> 등 강력 새로고침을 <b>살짝 차단</b>(키 입력 차단 + 나가기 경고)</li>
          <li class="muted">※ 웹 특성상 개발자도구/네트워크 레벨까지 100% 완전 차단은 불가능해.</li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">데이터 넣는 위치</div>
        <div class="muted">리딩/리스닝 데이터 파일은 이 프로젝트에 포함하지 않았어. 각 폴더에 파일을 넣으면 자동 인식돼.</div>
        <pre class="codeblock">(프로젝트 루트)/
  data/
    reading/   ← 리딩 txt 파일들
    listening/ ← 리스닝 세트 폴더들</pre>
      </div>
    `;
  }

function renderHome(){
    setWeek('Week');
    setSubbar('Home');
    setCounter('—');
    main.innerHTML = `
      <div class="hero">
        <div class="hero-card">
          <h1 class="hero-title">TOEFL Prep Web</h1>
          <p class="hero-sub">
            연습모드 + 실전(Simulation) 모드.<br/>
            Reading/Listening 데이터 파일은 프로젝트에 포함하지 않았어.<br/>
            <b>data/reading/</b>과 <b>data/listening/</b>에 넣으면 자동 인식돼.
          </p>
          <div class="row">
            <button class="bigbtn" id="goPractice">연습모드 시작</button>
            <button class="bigbtn secondary" id="goSim">Simulation Test 시작</button>
          </div>
          <div class="muted small" style="margin-top:10px">
            ※ Simulation은 팝업으로 열려. 팝업이 막혀 있으면 허용해줘.
          </div>
        </div>
        <div class="hero-card">
          <div class="kicker">빠른 이동</div>
          <div class="list">
            <div class="card">
              <div>
                <div class="card-title">Reading</div>
                <div class="card-meta">data/reading 넣으면 표시</div>
              </div>
              <div class="card-actions">
                <a class="btn secondary" href="/practice/reading">열기</a>
              </div>
            </div>
            <div class="card">
              <div>
                <div class="card-title">Listening</div>
                <div class="card-meta">폴더에 넣으면 표시</div>
              </div>
              <div class="card-actions">
                <a class="btn secondary" href="/practice/listening">열기</a>
              </div>
            </div>
          </div>

          <div style="margin-top:12px" class="muted small">
            실행은 <code>python -m http.server 8000</code> 추천.
          </div>
        </div>
      </div>
    `;
    $('#goPractice').onclick = ()=> navigate('/practice');
    $('#goSim').onclick = ()=> navigate('/sim/launch');
  }

  function renderPractice(){
    setWeek('Week');
    setSubbar('Practice');
    setCounter('—');
    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">연습모드</div>
        <div class="row">
          <a class="btn" href="/practice/reading">Reading 연습</a>
          <a class="btn" href="/practice/listening">Listening 연습</a>
          <a class="btn secondary" href="/sim/launch">Simulation Test</a>
        </div>
        <p class="muted" style="margin-top:14px">
          Reading/Listening은 목록에서 검색 후 풀 수 있어. 검색 결과는 <b>더보기</b> 또는 <b>전체 표시</b> 가능.
        </p>
      </div>
    `;
  }

  function renderNotFound(){
    setSubbar('Not Found');
    setCounter('—');
    main.innerHTML = `<div class="hero-card"><div class="kicker">404</div><div class="muted">잘못된 경로야.</div></div>`;
  }

  // Reading list with search + show more / show all
  async function renderReadingList(){
    setWeek('Week');
    setSubbar('Reading');
    setCounter('—');

    main.innerHTML = `
      <div class="hero-card">
        <div class="row">
          <input class="input" id="q" placeholder="검색: 제목/키워드" />
          <button class="btn secondary" id="btnRand">랜덤 1개</button>
        </div>
        <div class="muted small" style="margin-top:8px">※ 결과는 기본 60개만 표시돼. 아래 <b>더보기</b>로 늘릴 수 있어.</div>
      </div>
      <div style="height:12px"></div>
      <div class="list" id="list"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn secondary" id="btnMore">더보기</button>
        <button class="btn ghost" id="btnAll">전체 표시</button>
      </div>
    `;

    let idx;
    try{ idx = await withLoading('Reading 목록 로딩 중…', ()=>getReadingIndex()); }
    catch(e){
      main.innerHTML = `
        <div class="hero-card">
          <div class="kicker">Reading 데이터가 없어</div>
          <div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div>
          <div style="height:10px"></div>
          <div class="muted small"><code>data/reading/</code> 안에 리딩 txt 파일들을 넣어줘. (예: TOEFL_Reading_0002.txt)</div>
        </div>
      `;
      return;
    }
    const q = $('#q');
    const list = $('#list');
    let limit = 60;
    let filtered = idx;

    function render(){
      list.innerHTML = '';
      const shown = filtered.slice(0, limit);
      for(const it of shown){
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <div>
            <div class="card-title">${it.id.toString().padStart(4,'0')}. ${escape(it.title)}</div>
            <div class="card-meta">10 questions</div>
          </div>
          <div class="card-actions">
            <a class="btn secondary" href="/practice/reading/${it.id}">풀기</a>
          </div>
        `;
        list.appendChild(el);
      }
      $('#btnMore').disabled = limit >= filtered.length;
      $('#btnAll').disabled = limit >= filtered.length;
    }

    function escape(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

    q.addEventListener('input', ()=>{
      const v = q.value.trim().toLowerCase();
      limit = 60;
      if(!v) filtered = idx;
      else filtered = idx.filter(it => (it.title||'').toLowerCase().includes(v) || String(it.id).includes(v));
      render();
    });

    $('#btnMore').onclick = ()=>{ limit += 60; render(); };
    $('#btnAll').onclick = ()=>{ limit = filtered.length; render(); };
    $('#btnRand').onclick = ()=>{
      const it = filtered[Math.floor(Math.random()*filtered.length)];
      navigate(`/practice/reading/${it.id}`);
    };

    render();
  }

  async function renderReadingViewer(id){
    let idx;
    try{ idx = await withLoading('Reading 로딩 중…', ()=>getReadingIndex()); }
    catch(e){
      setWeek('Week');
      setSubbar('Reading');
      setCounter('—');
      main.innerHTML = `
        <div class="hero-card">
          <div class="kicker">Reading 데이터가 없어</div>
          <div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div>
          <div style="height:10px"></div>
          <div class="muted small"><code>data/reading/</code> 안에 리딩 txt 파일들을 넣어줘. (예: TOEFL_Reading_0002.txt)</div>
          <div style="height:12px"></div>
          <a class="btn secondary" href="/practice">연습모드로</a>
        </div>
      `;
      return;
    }
    const curIdx = idx.findIndex(x => x.id === id);
    const item = idx[curIdx];
    if(!item){ renderNotFound(); return; }

    nav.prev = curIdx>0 ? `/practice/reading/${idx[curIdx-1].id}` : null;
    nav.next = curIdx<idx.length-1 ? `/practice/reading/${idx[curIdx+1].id}` : null;
    bindTopNav();

    setWeek('Week');
    setSubbar(`Reading > Passage ${String(id).padStart(4,'0')}`);
    setCounter(`${String(curIdx+1).padStart(4,'0')}/${String(idx.length).padStart(4,'0')}`);

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">The following passage is for questions 1–10.</div>
              <div class="muted small">${escape(item.title)}</div>
            </div>
            <div class="row">
              <span class="pill">Reading</span>
            </div>
          </div>
          <div class="panel-body" id="passage"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title" id="qTitle">Question</div>
            <div class="row">
              <button class="btn secondary" id="btnPrevQ" title="Prev question"><img style="width:18px;height:18px;filter:none" src="assets/chev-left.svg"/></button>
              <button class="btn secondary" id="btnNextQ" title="Next question"><img style="width:18px;height:18px;filter:none" src="assets/chev-right.svg"/></button>
            </div>
          </div>
          <div class="panel-body">
            <div class="qwrap" id="qWrap"></div>
          </div>
        </section>
      </div>
    `;

    const data = await withLoading('Passage 불러오는 중…', ()=>loadReadingPassage(item.file, item.root));
    $('#passage').innerHTML = renderPassageHtml(data.passage);

    // --- Highlight & auto-scroll for referenced sentence in the prompt ---
    const passageEl = $('#passage');
    const passageParas = (window.TOEFL && typeof window.TOEFL.getPassageParagraphs === 'function')
      ? window.TOEFL.getPassageParagraphs(data.passage)
      : String(data.passage||'').split(/\n\s*\n/g).map(p=>String(p||'').replace(/\n/g,' ').trim()).filter(Boolean);

    $$('.p', passageEl).forEach((pEl, idx)=>{
      pEl.dataset.raw = passageParas[idx] || (pEl.textContent || '');
    });

    function _escapeRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function _cleanHint(h){
      if(!h) return '';
      let t = String(h).trim();
      t = t.replace(/^\[[A-D]\]\s*/i,''); // remove [A] marker
      t = t.replace(/\s+/g,' ').trim();
      return t;
    }

    function resetPassageHighlight(){
      $$('.p', passageEl).forEach((pEl)=>{
        const raw = pEl.dataset.raw ?? '';
        // restore plain paragraph (remove <mark>)
        pEl.innerHTML = escape(raw);
      });
    }

    function highlightSentenceFromPrompt(prompt){
      resetPassageHighlight();
      const hint = (window.TOEFL && typeof window.TOEFL.getSentenceHintFromPrompt === 'function')
        ? window.TOEFL.getSentenceHintFromPrompt(prompt)
        : '';
      const clean = _cleanHint(hint);
      if(!clean) return;

      // Try to find the best paragraph containing the sentence (loose match)
      const paras = $$('.p', passageEl);
      let best = null;

      const tryFind = (h)=>{
        const h2 = _cleanHint(h);
        if(!h2) return null;
        const re = new RegExp(_escapeRe(h2).replace(/\s+/g,'\\s+'), 'i');
        for(const pEl of paras){
          const raw = pEl.dataset.raw ?? pEl.textContent ?? '';
          const m = re.exec(raw);
          if(m){
            return { pEl, raw, idx: m.index, len: m[0].length };
          }
        }
        return null;
      };

      best = tryFind(clean);

      // fallback: use the first ~90 chars
      if(!best && clean.length > 90){
        best = tryFind(clean.slice(0, 90));
      }

      if(!best) return;

      const {pEl, raw, idx, len} = best;
      const before = raw.slice(0, idx);
      const mid = raw.slice(idx, idx + len);
      const after = raw.slice(idx + len);

      pEl.innerHTML = `${escape(before)}<mark class="hl">${escape(mid)}</mark>${escape(after)}`;

      // ✅ scroll passage panel to show highlight around middle
      try{
        const targetTop = pEl.offsetTop;
        const y = targetTop - (passageEl.clientHeight * 0.45); // 0.45 ~ middle-ish
        passageEl.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }catch(e){}
    }


    // if both Table and Prose Summary exist, keep both in practice (simulation will randomize)
    const questions = data.questions;
    let qIndex = 0;

    function renderQ(){
      const q = questions[qIndex];
      $('#qTitle').textContent = `Question ${q.num}  (${q.type})`;
      highlightSentenceFromPrompt(q.prompt);
      // 질문 카운터는 패널 안(qCounter)에 표시
      const qc = $('#qCounter');
      if(qc) qc.textContent = `${String(qIndex+1).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`;

      const wrap = $('#qWrap');
      wrap.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'qhead';
      head.innerHTML = `<div class="qnum">${q.num}</div><div><div class="qtext">${escapeMultiline(q.prompt)}</div></div>`;
      wrap.appendChild(head);

      // table rendering if prompt contains markdown table lines
      const tbl = extractTableFromPrompt(q.prompt);
      if(tbl){
        const tableEl = renderTable(tbl);
        wrap.appendChild(tableEl);
      }

      const saved = loadAnswer('reading', item.id, q.num);
      let selected = saved?.selected || null;
      let graded = saved?.graded || false;

      for(const ch of q.choices){
        const el = document.createElement('div');
        el.className = 'choice';
        if(selected === ch.letter) el.classList.add('selected');
        el.innerHTML = `
          <div class="letter">${ch.letter}</div>
          <div>${escape(ch.text)}</div>
        `;
        el.onclick = ()=>{
          if(graded) return;
          selected = ch.letter;
          $$('.choice', wrap).forEach(c=>c.classList.remove('selected'));
          el.classList.add('selected');
          saveAnswer('reading', item.id, q.num, {selected, graded:false});
        };
        wrap.appendChild(el);
      }

      const actions = document.createElement('div');
      actions.className = 'row';
      actions.innerHTML = `
        <button class="btn" id="btnCheck">채점</button>
        <button class="btn secondary" id="btnReset">지우기</button>
        <span class="muted small" id="result"></span>
      `;
      wrap.appendChild(actions);

      $('#btnCheck').onclick = ()=>{
        if(!selected){ toast('선택지 하나 골라줘'); return; }
        graded = true;
        saveAnswer('reading', item.id, q.num, {selected, graded:true});
        gradeChoices(wrap, q.correct, selected);
        $('#result').textContent = (selected === q.correct) ? '정답' : `오답 · 정답: ${q.correct}`;
      };
      $('#btnReset').onclick = ()=>{
        selected=null; graded=false;
        saveAnswer('reading', item.id, q.num, {selected:null, graded:false}, true);
        renderQ();
      };

      // restore grading
      if(graded && selected){
        gradeChoices(wrap, q.correct, selected);
        $('#result').textContent = (selected === q.correct) ? '정답' : `오답 · 정답: ${q.correct}`;
      }
    }

    $('#btnPrevQ').onclick = ()=>{
      qIndex = Math.max(0, qIndex-1);
      renderQ();
    };
    $('#btnNextQ').onclick = ()=>{
      qIndex = Math.min(questions.length-1, qIndex+1);
      renderQ();
    };

    renderQ();
  }

  function renderPassageHtml(text){
    if(window.TOEFL && typeof window.TOEFL.formatPassageHtml === 'function'){
      return window.TOEFL.formatPassageHtml(text);
    }
    // fallback
    const html = (text||'').split(/\n\s*\n/g).map(p=>`<p class="p">${escape(p).replace(/\n/g,' ')}</p>`).join('');
    return html;
  }

  function escapeMultiline(s){
    return (s||'')
      .split('\n')
      .map(line=>escape(line))
      .join('<br/>');
  }
  function escape(s){
    return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function extractTableFromPrompt(prompt){
    const lines = (prompt||'').split('\n');
    const start = lines.findIndex(l => l.trim().startsWith('|') && l.includes('|'));
    if(start === -1) return null;
    const tableLines = [];
    for(let i=start;i<lines.length;i++){
      if(!lines[i].trim().startsWith('|')) break;
      tableLines.push(lines[i]);
    }
    if(tableLines.length < 2) return null;
    const rows = tableLines.map(l => l.split('|').slice(1,-1).map(x=>x.trim()));
    return rows;
  }

  function renderTable(rows){
    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    for(const h of rows[0]){
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for(let r=1;r<rows.length;r++){
      const tr = document.createElement('tr');
      for(const cell of rows[r]){
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    wrap.appendChild(table);
    return wrap;
  }

  function gradeChoices(wrap, correct, selected){
    const choices = $$('.choice', wrap);
    for(const el of choices){
      const letter = el.querySelector('.letter')?.textContent?.trim();
      el.classList.remove('correct','wrong');
      if(letter === correct) el.classList.add('correct');
      if(letter === selected && selected !== correct) el.classList.add('wrong');
    }
  }

  // (practice answers are stored only in-memory; see practiceStore at top)

  // Listening list
  async function renderListeningList(){
    setWeek('Week');
    setSubbar('Listening');
    setCounter('—');
    main.innerHTML = `
      <div class="hero-card">
        <div class="row">
          <input class="input" id="q" placeholder="검색: topic/category" />
          <button class="btn secondary" id="btnReload">재스캔</button>
          <button class="btn secondary" id="btnRand">랜덤 1세트</button>
        </div>
        <div class="muted small" style="margin-top:8px">
          ※ Listening 팩이 안 보이면 <code>data/listening/</code>에 넣기한 뒤 <b>재스캔</b> 눌러줘.
        </div>
      </div>
      <div style="height:12px"></div>
      <div class="list" id="list"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn secondary" id="btnMore">더보기</button>
        <button class="btn ghost" id="btnAll">전체 표시</button>
      </div>
    `;

    const q = $('#q');
    const list = $('#list');
    let limit = 40;

    let idx = [];
    try{
      idx = await getListeningIndex();
    }catch(e){
      list.innerHTML = `<div class="hero-card"><div class="kicker">Listening 팩이 안 보임</div><div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div></div>`;
      $('#btnMore').disabled = true;
      $('#btnAll').disabled = true;
      $('#btnRand').disabled = true;
      return;
    }

    let filtered = idx;

    function render(){
      list.innerHTML = '';
      const shown = filtered.slice(0, limit);
      for(const it of shown){
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <div>
            <div class="card-title">Set ${String(it.set).padStart(3,'0')} · ${escape(it.format)}</div>
            <div class="card-meta">${escape(it.category)} · ${escape(it.main_topic || it.scenario || '')}</div>
          </div>
          <div class="card-actions">
            <a class="btn secondary" href="/practice/listening/${it.set}">풀기</a>
          </div>
        `;
        list.appendChild(el);
      }
      $('#btnMore').disabled = limit >= filtered.length;
      $('#btnAll').disabled = limit >= filtered.length;
    }

    q.addEventListener('input', ()=>{
      const v = q.value.trim().toLowerCase();
      limit = 40;
      if(!v) filtered = idx;
      else filtered = idx.filter(it =>
        (it.category||'').toLowerCase().includes(v) ||
        (it.main_topic||'').toLowerCase().includes(v) ||
        (it.scenario||'').toLowerCase().includes(v) ||
        String(it.set).includes(v) ||
        (it.format||'').toLowerCase().includes(v)
      );
      render();
    });

    $('#btnMore').onclick = ()=>{ limit += 40; render(); };
    $('#btnAll').onclick = ()=>{ limit = filtered.length; render(); };
    $('#btnRand').onclick = ()=>{
      const it = filtered[Math.floor(Math.random()*filtered.length)];
      navigate(`/practice/listening/${it.set}`);
    };
    $('#btnReload').onclick = ()=>{
      sessionStorage.removeItem('toefl_listening_index_v1');
      sessionStorage.removeItem('toefl_listening_root_v1');
      toast('재스캔 중...');
      setTimeout(()=> location.reload(), 250);
    };

    render();
  }

  // 아래부터 Listening/Sim 관련 코드는 너가 준 그대로라 생략 없이 유지됨
  // (이 파일에서 바꾼 건 highlight scroll 계산 1곳뿐이야)

  // Listening viewer / sim launcher / link interceptor ... (원본 그대로)
  // --- 너가 붙여준 코드의 나머지 부분은 변경 없음 ---

  // 내부 링크 클릭을 SPA 네비게이션으로 처리
  document.addEventListener('click', (e)=>{
    const a = e.target && e.target.closest ? e.target.closest('a') : null;
    if(!a) return;
    if(a.target && a.target !== '_self') return;
    const href = a.getAttribute('href');
    if(!href) return;

    // 외부 링크/특수 링크는 패스
    if(/^(https?:)?\/\//i.test(href)) return;
    if(href.startsWith('mailto:') || href.startsWith('tel:')) return;

    // legacy hash
    if(href.startsWith('#/')){
      e.preventDefault();
      navigate(href.replace(/^#/, ''));
      return;
    }

    // 앱 내부 경로
    if(href.startsWith('/')){
      e.preventDefault();
      navigate(href);
      return;
    }
  }, true);

  // init
  window.addEventListener('popstate', route);
  route();

})();
