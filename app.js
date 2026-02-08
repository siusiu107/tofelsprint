
/* app.js - 메인 앱 */
(function(){
  const { $, $$, toast, fmtTime, getReadingIndex, loadReadingPassage, getListeningIndex, loadListeningSet, pickRandom, secureAudio, setSectionIsListening, fileUrl } = window.TOEFL;

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

  function bindTopNav(){
    btnPrev.onclick = ()=>{ if(nav.prev) location.hash = nav.prev; };
    btnNext.onclick = ()=>{ if(nav.next) location.hash = nav.next; };
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
    const hash = location.hash || '#/';
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

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

    renderNotFound();
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
            Reading/Listening 데이터는 zip에 포함 안 했어.<br/>
            <b>data/reading/</b>과 <b>data/listening/</b>에 각각 압축 해제하면 자동 인식돼.
          </p>
          <div class="row">
            <button class="bigbtn" id="goPractice">연습모드 시작</button>
            <button class="bigbtn secondary" id="goSim">Simulation Test 시작</button>
          </div>
          <div class="muted small" style="margin-top:10px">
            ※ Simulation은 팝업으로 열려. 팝업 차단 해제해줘.
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
                <a class="btn secondary" href="#/practice/reading">열기</a>
              </div>
            </div>
            <div class="card">
              <div>
                <div class="card-title">Listening</div>
                <div class="card-meta">R2 업로드 후 자동 인식</div>
              </div>
              <div class="card-actions">
                <a class="btn secondary" href="#/practice/listening">열기</a>
              </div>
            </div>
          </div>

          <div style="margin-top:12px" class="muted small">
            실행은 <code>python -m http.server 8000</code> 추천.
          </div>
        </div>
      </div>
    `;
    $('#goPractice').onclick = ()=> location.hash = '#/practice';
    $('#goSim').onclick = ()=> location.hash = '#/sim/launch';
  }

  function renderPractice(){
    setWeek('Week');
    setSubbar('Practice');
    setCounter('—');
    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">연습모드</div>
        <div class="row">
          <a class="btn" href="#/practice/reading">Reading 연습</a>
          <a class="btn" href="#/practice/listening">Listening 연습</a>
          <a class="btn secondary" href="#/sim/launch">Simulation Test</a>
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
    try{ idx = await getReadingIndex(); }
    catch(e){
      main.innerHTML = `
        <div class="hero-card">
          <div class="kicker">Reading 데이터가 없어</div>
          <div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div>
          <div style="height:10px"></div>
          <div class="muted small">Cloudflare R2에 <code>reading/</code> 폴더로 Reading txt들을 업로드하고, Worker/R2 설정을 끝낸 뒤 다시 열어줘.</div>
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
            <div class="card-meta">${it.wordCount?`~${it.wordCount} words`:'—'}</div>
          </div>
          <div class="card-actions">
            <a class="btn secondary" href="#/practice/reading/${it.id}">풀기</a>
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
      location.hash = `#/practice/reading/${it.id}`;
    };

    render();
  }

  async function renderReadingViewer(id){
    let idx;
    try{ idx = await getReadingIndex(); }
    catch(e){
      setWeek('Week');
      setSubbar('Reading');
      setCounter('—');
      main.innerHTML = `
        <div class="hero-card">
          <div class="kicker">Reading 데이터가 없어</div>
          <div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div>
          <div style="height:10px"></div>
          <div class="muted small">Cloudflare R2에 <code>reading/</code> 폴더로 Reading txt들을 업로드하고, Worker/R2 설정을 끝낸 뒤 다시 열어줘.</div>
          <div style="height:12px"></div>
          <a class="btn secondary" href="#/practice">연습모드로</a>
        </div>
      `;
      return;
    }
    const curIdx = idx.findIndex(x => x.id === id);
    const item = idx[curIdx];
    if(!item){ renderNotFound(); return; }

    nav.prev = curIdx>0 ? `#/practice/reading/${idx[curIdx-1].id}` : null;
    nav.next = curIdx<idx.length-1 ? `#/practice/reading/${idx[curIdx+1].id}` : null;
    bindTopNav();

    setWeek('Week');
    setSubbar(`Reading > Passage ${String(id).padStart(4,'0')}`);
    setCounter(`${String(curIdx+1).padStart(2,'0')}/${String(idx.length).padStart(2,'0')}`);

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">The following passage is for questions 1–10.</div>
              <div class="muted small">${escape(item.title)} ${item.wordCount?` · ${item.wordCount} words`:''}</div>
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

    const data = await loadReadingPassage(item.file, item.root);
    $('#passage').innerHTML = renderPassageHtml(data.passage);

    // if both Table and Prose Summary exist, keep both in practice (simulation will randomize)
    const questions = data.questions;
    let qIndex = 0;

    function renderQ(){
      const q = questions[qIndex];
      $('#qTitle').textContent = `Question ${q.num}  (${q.type})`;
      // update top counter like 01/10
      topCounter.textContent = `${String(q.num).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`;

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
    // basic paragraph split
    const html = text.split(/\n\s*\n/g).map(p=>`<p>${escape(p).replace(/\n/g,'<br/>')}</p>`).join('');
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
          ※ Cloudflare R2에 <code>listening/</code> 아래로 Listening 팩을 업로드하고 Worker/R2 설정을 확인해줘. (재스캔은 인덱스 캐시 삭제용)
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
      list.innerHTML = `<div class="hero-card"><div class="kicker">Listening 데이터를 못 불러옴</div><div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div></div>`;
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
            <a class="btn secondary" href="#/practice/listening/${it.set}">풀기</a>
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
      location.hash = `#/practice/listening/${it.set}`;
    };
    $('#btnReload').onclick = ()=>{
      sessionStorage.removeItem('toefl_listening_index_v1');
      sessionStorage.removeItem('toefl_listening_index_v2');
      sessionStorage.removeItem('toefl_listening_root_v1');
      sessionStorage.removeItem('toefl_reading_index_v1');
      toast('재스캔 중...');
      setTimeout(()=> location.reload(), 250);
    };

    render();
  }

  async function renderListeningViewer(setId){
    setWeek('Week');
    setSubbar(`Listening > Set ${String(setId).padStart(3,'0')}`);
    setCounter('—');

    // load index and find entry
    let idx = [];
    try{ idx = await getListeningIndex(); }
    catch(e){
      main.innerHTML = `<div class="hero-card"><div class="kicker">Listening 데이터를 못 불러옴</div><div class="muted">${(e.message||String(e)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}</div></div>`;
      return;
    }
    const curIdx = idx.findIndex(x => x.set === setId);
    const entry = idx[curIdx];
    if(!entry){ renderNotFound(); return; }

    nav.prev = curIdx>0 ? `#/practice/listening/${idx[curIdx-1].set}` : null;
    nav.next = curIdx<idx.length-1 ? `#/practice/listening/${idx[curIdx+1].set}` : null;
    bindTopNav();

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Listening > ${escape(entry.format)}</div>
              <div class="muted small">${escape(entry.category)} · ${escape(entry.main_topic||entry.scenario||'')}</div>
            </div>
            <div class="row">
              <span class="pill">Listening</span>
              <button class="btn secondary" id="btnScript"><img style="width:18px;height:18px;filter:none" src="assets/doc.svg"/> Script</button>
            </div>
          </div>
          <div class="panel-body" id="listenLeft">
            <div class="muted small">&lt;The following script is for question 1, so listen carefully.&gt;</div>
            <div style="height:18px"></div>
            <div class="listen-figure">
              <div class="listen-avatar"></div>
              <div class="listen-board"></div>
            </div>
            <div style="height:18px"></div>
            <div class="row">
              <button class="btn" id="btnStart">Start</button>
              <button class="btn secondary" id="btnStop">Stop</button>
              <span class="muted small" id="phaseLabel"></span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title" id="qTitle">Question</div>
            <div class="row">
              <button class="btn secondary" id="btnPrevQ" title="Prev"><img style="width:18px;height:18px;filter:none" src="assets/chev-left.svg"/></button>
              <span class="pill" id="qCounter">—</span>
              <button class="btn secondary" id="btnPlayQ" title="Play question audio">Q Audio</button>
              <button class="btn secondary" id="btnNextQ" title="Next"><img style="width:18px;height:18px;filter:none" src="assets/chev-right.svg"/></button>
            </div>
          </div>
          <div class="panel-body">
            <div class="qwrap" id="qWrap"></div>
          </div>
        </section>
      </div>
    `;

    // extra css bits for the illustration
    injectListeningIllustrationCSS();

    let data;
    try{
      data = await loadListeningSet(entry);
    }catch(e){
      $('#qWrap').innerHTML = `<div class="muted">질문 파일을 못 읽었어: ${escape(String(e.message||e))}</div>`;
      return;
    }

    const questions = data.questions;
    let qIndex = 0;
    let phase = 'idle'; // idle, main, qAudio, answer, ready
    let waitingAnswer = false;

    // practice answers (in-memory)
    const setKey = entry.set;

    const audio = new Audio();
    audio.preload = 'auto';
    curAudio = audio;
    // 오디오 임의 조작(배속/시킹) 최대한 차단 (연습모드는 일시정지 허용)
    setSectionIsListening(()=> location.hash.startsWith('#/practice/listening/'));
    secureAudio(audio, { blockPause:false });

    function updateAudioBar(){
      const wrap = document.getElementById('audioBarWrap');
      const fill = document.getElementById('audioBarFill');
      const label = document.getElementById('audioBarLabel');
      const time = document.getElementById('audioBarTime');

      wrap.classList.remove('hidden');
      label.textContent = 'Listening (audio)';
      const dur = audio.duration || 0;
      const cur = audio.currentTime || 0;
      const rem = Math.max(0, dur - cur);
      time.textContent = fmtTime(rem);
      if(dur > 0){
        fill.style.width = `${Math.max(0, Math.min(100, (cur/dur)*100))}%`;
      }else{
        fill.style.width = '0%';
      }
    }

    function startAudioBarTick(){
      clearInterval(audioTick);
      audioTick = setInterval(updateAudioBar, 120);
      showAudioBar(true);
      updateAudioBar();
    }

    function play(url){
      audio.src = url;
      audio.currentTime = 0;
      audio.play().catch(err=>{
        toast('오디오 재생 실패(브라우저 정책). Start 다시 눌러줘');
      });
      startAudioBarTick();
    }

    function stopAll(){
      waitingAnswer = false;
      phase = 'idle';
      $('#phaseLabel').textContent = '';
      audio.pause();
      audio.currentTime = 0;
      stopAudio();
      showAudioBar(false);
    }

    function renderPlaceholder(text){
      const wrap = $('#qWrap');
      wrap.innerHTML = `<div class="muted" style="padding:10px">${escape(text||'오디오 재생 중…')}</div>`;
      $('#qTitle').textContent = 'Question';
      $('#qCounter').textContent = `${String(qIndex+1).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`;
      setCounter(`${String(qIndex+1).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`);
    }

    function renderQ(){
      const q = questions[qIndex];
      $('#qTitle').textContent = `Q${q.num} (${q.type})`;
      $('#qCounter').textContent = `${String(qIndex+1).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`;
      setCounter(`${String(qIndex+1).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`);

      const wrap = $('#qWrap');
      wrap.innerHTML = '';

      const head = document.createElement('div');
      head.className = 'qhead';
      head.innerHTML = `<div class="qnum">${q.num}</div><div><div class="qtext">${escapeMultiline(q.prompt)}</div></div>`;
      wrap.appendChild(head);

      const saved = loadAnswer('listening', setKey, q.num);
      let selected = saved?.selected || null;
      let graded = saved?.graded || false;

      for(const ch of q.choices){
        const el = document.createElement('div');
        el.className = 'choice';
        if(selected === ch.letter) el.classList.add('selected');
        el.innerHTML = `<div class="letter">${ch.letter}</div><div>${escape(ch.text)}</div>`;
        el.onclick = ()=>{
          if(!waitingAnswer) return; // only after question audio ends
          if(graded) return;
          selected = ch.letter;
          $$('.choice', wrap).forEach(c=>c.classList.remove('selected'));
          el.classList.add('selected');
          saveAnswer('listening', setKey, q.num, {selected, graded:false});
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
        if(!waitingAnswer){ toast('질문 오디오가 끝난 뒤에 풀 수 있어'); return; }
        if(!selected){ toast('선택지 하나 골라줘'); return; }
        graded = true;
        saveAnswer('listening', setKey, q.num, {selected, graded:true});
        gradeChoices(wrap, q.correct, selected);
        $('#result').textContent = (selected === q.correct) ? '정답' : `오답 · 정답: ${q.correct}`;
      };
      $('#btnReset').onclick = ()=>{
        saveAnswer('listening', setKey, q.num, null, true);
        waitingAnswer = true;
        renderQ();
      };

      if(graded && selected){
        gradeChoices(wrap, q.correct, selected);
        $('#result').textContent = (selected === q.correct) ? '정답' : `오답 · 정답: ${q.correct}`;
      }
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
    function gradeChoices(wrap, correct, selected){
      const choices = $$('.choice', wrap);
      for(const el of choices){
        const letter = el.querySelector('.letter')?.textContent?.trim();
        el.classList.remove('correct','wrong');
        if(letter === correct) el.classList.add('correct');
        if(letter === selected && selected !== correct) el.classList.add('wrong');
      }
    }
    function gotoQuestion(newIdx){
      qIndex = Math.max(0, Math.min(questions.length-1, newIdx));
      waitingAnswer = false;
      phase = 'ready';
      renderPlaceholder('Q Audio 버튼을 눌러 질문 오디오를 재생해줘');
      $('#phaseLabel').textContent = `Ready (Q${questions[qIndex].num})`;
    }

    function playMain(){
      phase = 'main';
      $('#phaseLabel').textContent = 'Main audio...';
      waitingAnswer = false;
      qIndex = 0;
      renderPlaceholder('Main audio 재생 중…');
      play(fileUrl(`${entry.path}/listening.mp3`));
    }

    function playQuestionAudio(){
      phase = 'qAudio';
      const qnum = questions[qIndex].num;
      $('#phaseLabel').textContent = `Question ${qnum} audio...`;
      waitingAnswer = false;
      renderPlaceholder('Question audio 재생 중…');
      // question audio
      const url = fileUrl(`${entry.path}/questions_q${String(qnum).padStart(2,'0')}.mp3`);
      play(url);
    }

    audio.addEventListener('ended', ()=>{
      if(phase === 'main'){
        // main audio ended -> show instruction (practice is manual)
        phase = 'ready';
        waitingAnswer = false;
        $('#phaseLabel').textContent = `Main 끝 · Q${questions[qIndex].num} 준비됨 (Q Audio 눌러줘)`;
        renderPlaceholder('Q Audio 버튼을 눌러 질문 오디오를 재생해줘');
      } else if(phase === 'qAudio'){
        // question audio ended -> show question and allow answering (manual next)
        phase = 'answer';
        waitingAnswer = true;
        $('#phaseLabel').textContent = `Answer Q${questions[qIndex].num} (연습모드: 수동 이동)`;
        renderQ();
      }
    });

    $('#btnStart').onclick = ()=> playMain();
    $('#btnStop').onclick = ()=> stopAll();

    $('#btnPlayQ').onclick = ()=>{
      if(phase === 'main'){ toast('Main audio 끝난 뒤에'); return; }
      playQuestionAudio();
    };
    $('#btnPrevQ').onclick = ()=> gotoQuestion(qIndex-1);
    $('#btnNextQ').onclick = ()=> gotoQuestion(qIndex+1);

    $('#btnScript').onclick = async ()=>{
      try{
        const res = await fetch(fileUrl(`${entry.path}/script.txt`), {cache:'no-store', credentials:'include'});
        if(!res.ok) throw new Error('script.txt 없음');
        const script = await res.text();

        const box = document.createElement('div');
        box.className = 'hero-card';
        box.innerHTML = `<div class="kicker">Script</div><pre style="white-space:pre-wrap;line-height:1.5;margin:0">${escape(script)}</pre>`;

        const d = document.createElement('div');
        d.className = 'drawer';
        d.innerHTML = `<div class="drawer-card" style="width:min(720px,95vw)"></div>`;
        d.querySelector('.drawer-card').appendChild(box);

        const close = document.createElement('button');
        close.className = 'btn';
        close.textContent = '닫기';
        close.style.marginTop = '12px';
        close.onclick = ()=> d.remove();
        d.querySelector('.drawer-card').appendChild(close);

        d.addEventListener('click', (ev)=>{ if(ev.target===d) d.remove(); });
        document.body.appendChild(d);
      }catch(err){
        toast('script.txt를 못 읽었어');
      }
    };
    // initial state
    renderPlaceholder('Start를 누르면 Listening 오디오가 재생돼');
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
    `;
    document.head.appendChild(style);
  }

  // Simulation launcher
  function renderSimLaunch(){
    setWeek('Week');
    setSubbar('Simulation Test');
    setCounter('—');
    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">Simulation Test</div>
        <p class="muted">
          팝업으로 열려. 시간 조정은 불가(고정).<br/>
          Listening은 **오디오 재생 중엔 문제를 숨기고**, 질문 오디오가 끝나면<br/>
          **답 선택 여부와 관계없이 자동으로 다음으로 넘어가**(기본 8초 답변창).
        </p>
        <div class="row">
          <button class="bigbtn" id="btnOpenSim">Simulation 시작</button>
          <a class="bigbtn secondary" href="#/practice">연습모드</a>
        </div>
        <div class="muted small" style="margin-top:10px">
          ※ 팝업이 막히면 브라우저 설정에서 이 사이트 팝업 허용해줘.
        </div>
      </div>
    `;
    $('#btnOpenSim').onclick = ()=>{
      const w = window.open('sim.html', 'toefl_sim', 'width=1280,height=900');
      if(!w){
        alert('팝업이 차단됐어. 주소창 옆 팝업 허용해줘.');
      }
    };
  }

  // init
  window.addEventListener('hashchange', route);
  route();

})();
