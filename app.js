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
  
  // app state
  let curAudio = null;
  let audioTick = null;

  function stopAudio(){
    try{
      if(curAudio){
        curAudio.pause();
        curAudio.src = '';
      }
    }catch(e){}
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
      if(nav.prev) location.hash = nav.prev;
    };
    btnNext.onclick = ()=>{
      if(btnNext.disabled) return;
      if(nav.next) location.hash = nav.next;
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
    const hash = location.hash || '#/';
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

    // reset top nav
    nav.prev = null; nav.next = null;
    bindTopNav();

    if(parts.length === 0){
      renderHome();
      return;
    }

    // practice
    if(parts[0] === 'practice'){
      if(parts.length === 1){
        renderPracticeHome();
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
      renderNotFound();
      return;
    }

    // simtest
    if(parts[0] === 'sim'){
      renderSimEntry();
      return;
    }

    renderNotFound();
  }

  function setSubbar(text){ subbar.textContent = text; }
  function setCounter(text){ topCounter.textContent = text || '—'; }
  function setWeek(text){ weekPill.textContent = text || 'Week'; }

  function showAudioBar(show){
    if(show) audioBarWrap.classList.remove('hidden');
    else audioBarWrap.classList.add('hidden');
  }

  function renderHome(){
    setWeek('Week');
    setSubbar('Home');
    setCounter('—');

    main.innerHTML = `
      <div class="hero">
        <div class="hero-card">
          <div class="kicker">TOEFL Prep</div>
          <div class="title">연습모드 / 실전모드</div>
          <div class="muted">TOEFL 스타일로 Reading/Listening을 연습하고, 실전처럼 Simulation Test를 돌릴 수 있어.</div>
          <div class="grid2" style="margin-top:14px">
            <a class="btn primary" href="#/practice">연습모드</a>
            <a class="btn secondary" href="#/sim">Simulation Test</a>
          </div>
          <div class="muted small" style="margin-top:14px">
            데이터는 레포의 <code>data/reading</code>, <code>data/listening</code>에 직접 넣어줘.
          </div>
        </div>
        <div class="hero-card">
          <div class="kicker">Tip</div>
          <div class="muted">
            - Reading은 <code>TOEFL_Reading_0002.txt</code> 같은 파일이 있어야 인식돼.<br/>
            - Listening은 <code>Listening_Set_001/answer_key.txt</code>가 있어야 인식돼.
          </div>
        </div>
      </div>
    `;
  }

  function renderPracticeHome(){
    setWeek('Week');
    setSubbar('Practice');
    setCounter('—');

    main.innerHTML = `
      <div class="hero">
        <div class="hero-card">
          <div class="kicker">Practice Mode</div>
          <div class="title">원하는 문제를 골라서 풀기</div>
          <div class="muted">연습모드는 자유롭게 선택/이동 가능하고, 저장도 하지 않아.</div>
          <div style="height:12px"></div>
          <div class="grid2">
            <a class="btn primary" href="#/practice/reading">Reading</a>
            <a class="btn primary" href="#/practice/listening">Listening</a>
          </div>
        </div>
        <div class="hero-card">
          <div class="kicker">Simulation</div>
          <div class="title">실전처럼 풀기</div>
          <div class="muted">실전모드는 팝업으로 열리고, 시간 조정/오디오 조작이 제한돼.</div>
          <div style="height:12px"></div>
          <a class="btn secondary" href="#/sim">Simulation Test 시작</a>
        </div>
      </div>
    `;
  }

  async function renderReadingList(){
    setWeek('Week');
    setSubbar('Reading');
    setCounter('—');

    main.innerHTML = `
      <div class="row" style="gap:10px;align-items:flex-end">
        <div style="flex:1">
          <div class="kicker">Reading Practice</div>
          <div class="muted small">검색 후 “더보기/전체 표시”로 목록을 펼칠 수 있어.</div>
        </div>
        <button class="btn ghost" id="btnRand">랜덤</button>
      </div>

      <div style="height:10px"></div>
      <div class="row" style="gap:10px">
        <input class="input" id="q" placeholder="검색: passage 번호/키워드"/>
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
          <div class="muted small">TOFEL기출-reading.zip을 <code>data/reading/</code> 안에 압축 해제해줘. (txt 파일들이 바로 보여야 함)</div>
          <div style="height:12px"></div>
          <a class="btn secondary" href="#/practice">연습모드로</a>
        </div>
      `;
      return;
    }

    let filtered = idx;
    let limit = 60;

    const list = $('#list');
    const q = $('#q');

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
          <div class="muted small">TOFEL기출-reading.zip을 <code>data/reading/</code> 안에 압축 해제해줘. (txt 파일들이 바로 보여야 함)</div>
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
    setCounter(`${String(curIdx+1).padStart(4,'0')}/${String(idx.length).padStart(4,'0')}`);

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">The following passage is for reading.</div>
              <div class="muted small" id="passTitle">—</div>
            </div>
          </div>
          <div class="panel-body" id="passage"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title" id="qTitle">Question</div>
            <div class="row">
              <button class="btn secondary" id="btnPrevQ" title="Prev question"><img style="width:18px;height:18px;filter:none" src="assets/chev-left.svg"/></button>
              <span class="pill" id="qCounter">—</span>
              <button class="btn secondary" id="btnNextQ" title="Next question"><img style="width:18px;height:18px;filter:none" src="assets/chev-right.svg"/></button>
            </div>
          </div>
          <div class="panel-body">
            <div class="muted small" id="qType">—</div>
            <div class="qstem" id="qStem"></div>
            <div class="choices" id="choices"></div>
            <div style="height:12px"></div>
            <div class="row" style="gap:10px">
              <button class="btn ghost" id="btnCheck">채점</button>
              <div class="spacer"></div>
              <div class="muted small" id="result"></div>
            </div>
          </div>
        </section>
      </div>
    `;

    const data = await withLoading('Passage 불러오는 중…', ()=>loadReadingPassage(item.file, item.root));
    $('#passage').innerHTML = renderPassageHtml(data.passage);
    $('#passTitle').textContent = data.title || item.title || '—';

    // if both Table and Prose Summary exist, keep both in practice (simulation will randomize)
    const questions = data.questions;
    let qIndex = 0;

    function renderQ(){
      const q = questions[qIndex];
      $('#qTitle').textContent = `Question ${q.num}  (${q.type})`;
      // 질문 카운터는 패널 안(qCounter)에 표시
      $('#qCounter').textContent = `${String(qIndex+1).padStart(2,'0')}/${String(questions.length).padStart(2,'0')}`;

      $('#qType').textContent = `Type: ${q.type}`;
      $('#qStem').innerHTML = escapeMultiline(q.stem);

      const choicesWrap = $('#choices');
      choicesWrap.innerHTML = '';

      for(const c of q.choices){
        const el = document.createElement('button');
        el.className = 'choice';
        el.type = 'button';
        el.innerHTML = `
          <span class="letter">${c.letter}</span>
          <span class="text">${escape(c.text)}</span>
        `;
        el.onclick = ()=>{
          // practice: 자유롭게 선택/수정 가능
          q.selected = c.letter;
          for(const b of $$('.choice', choicesWrap)) b.classList.remove('selected');
          el.classList.add('selected');
          $('#result').textContent = '';
        };
        if(q.selected === c.letter) el.classList.add('selected');
        choicesWrap.appendChild(el);
      }

      $('#result').textContent = '';
    }

    function grade(){
      const q = questions[qIndex];
      if(!q.selected){
        toast('답을 선택해줘');
        return;
      }
      const correct = q.answer;
      const ok = (q.selected === correct);
      $('#result').textContent = ok ? '정답!' : `오답 (정답: ${correct})`;

      // highlight
      const wrap = $('#choices');
      const choices = $$('.choice', wrap);
      for(const el of choices){
        const letter = el.querySelector('.letter')?.textContent?.trim();
        el.classList.remove('correct','wrong');
        if(letter === correct) el.classList.add('correct');
        if(letter === q.selected && q.selected !== correct) el.classList.add('wrong');
      }
    }

    function goto(i){
      qIndex = Math.max(0, Math.min(questions.length-1, i));
      renderQ();
    }

    $('#btnPrevQ').onclick = ()=> goto(qIndex-1);
    $('#btnNextQ').onclick = ()=> goto(qIndex+1);
    $('#btnCheck').onclick = grade;

    renderQ();
  }

  function renderPassageHtml(p){
    const chunks = (p||'').split('\n').map(s=>s.trim()).filter(Boolean);
    return chunks.map(par=>`<p class="p">${escape(par)}</p>`).join('');
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

  async function renderListeningList(){
    setWeek('Week');
    setSubbar('Listening');
    setCounter('—');

    main.innerHTML = `
      <div class="row" style="gap:10px;align-items:flex-end">
        <div style="flex:1">
          <div class="kicker">Listening Practice</div>
          <div class="muted small">Lecture/Conversation 세트 목록</div>
        </div>
        <button class="btn ghost" id="btnRand">랜덤</button>
      </div>

      <div style="height:10px"></div>
      <div class="row" style="gap:10px">
        <input class="input" id="q" placeholder="검색: set 번호/키워드"/>
      </div>

      <div style="height:12px"></div>
      <div class="list" id="list"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn secondary" id="btnMore">더보기</button>
        <button class="btn ghost" id="btnAll">전체 표시</button>
      </div>
    `;

    let idx;
    try{ idx = await withLoading('Listening 목록 로딩 중…', ()=>getListeningIndex()); }
    catch(e){
      main.innerHTML = `
        <div class="hero-card">
          <div class="kicker">Listening 데이터가 없어</div>
          <div class="muted">${escape(e.message||String(e))}</div>
          <div style="height:10px"></div>
          <div class="muted small">TOFEL기출-listening.zip을 <code>data/listening/</code> 안에 압축 해제해줘. (예: <code>Listening_Set_001/answer_key.txt</code>)</div>
          <div style="height:12px"></div>
          <a class="btn secondary" href="#/practice">연습모드로</a>
        </div>
      `;
      return;
    }

    let filtered = idx;
    let limit = 50;
    const list = $('#list');
    const q = $('#q');

    function render(){
      list.innerHTML = '';
      const shown = filtered.slice(0, limit);
      for(const it of shown){
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <div>
            <div class="card-title">${String(it.set).padStart(3,'0')}. ${escape(it.main_topic||it.scenario||it.category||'Listening Set')}</div>
            <div class="card-meta">${escape(it.format||'—')} ${it.category?('• '+escape(it.category)):'—'}</div>
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
      limit = 50;
      if(!v) filtered = idx;
      else filtered = idx.filter(it =>
        String(it.set).includes(v) ||
        (it.format||'').toLowerCase().includes(v) ||
        (it.category||'').toLowerCase().includes(v) ||
        (it.main_topic||it.scenario||'').toLowerCase().includes(v)
      );
      render();
    });

    $('#btnMore').onclick = ()=>{ limit += 50; render(); };
    $('#btnAll').onclick = ()=>{ limit = filtered.length; render(); };
    $('#btnRand').onclick = ()=>{
      const it = filtered[Math.floor(Math.random()*filtered.length)];
      location.hash = `#/practice/listening/${it.set}`;
    };

    render();
  }

  async function renderListeningViewer(setId){
    let idx;
    try{ idx = await withLoading('Listening 로딩 중…', ()=>getListeningIndex()); }
    catch(e){
      setWeek('Week');
      setSubbar('Listening');
      setCounter('—');
      main.innerHTML = `
        <div class="hero-card">
          <div class="kicker">Listening 데이터가 없어</div>
          <div class="muted">${escape(e.message||String(e))}</div>
          <div style="height:10px"></div>
          <div class="muted small">TOFEL기출-listening.zip을 <code>data/listening/</code> 안에 압축 해제해줘. (예: <code>Listening_Set_001/answer_key.txt</code>)</div>
          <div style="height:12px"></div>
          <a class="btn secondary" href="#/practice">연습모드로</a>
        </div>
      `;
      return;
    }
    const curIdx = idx.findIndex(x => x.set === setId);
    const entry = idx[curIdx];
    if(!entry){ renderNotFound(); return; }

    nav.prev = curIdx>0 ? `#/practice/listening/${idx[curIdx-1].set}` : null;
    nav.next = curIdx<idx.length-1 ? `#/practice/listening/${idx[curIdx+1].set}` : null;
    bindTopNav();

    setWeek('Week');
    setSubbar(`Listening > Set ${String(setId).padStart(3,'0')}`);
    setCounter(`${String(curIdx+1).padStart(2,'0')}/${String(idx.length).padStart(2,'0')}`);

    main.innerHTML = `
      <div class="grid2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Listening</div>
              <div class="muted small">${escape(entry.format||'—')} • ${escape(entry.category||'—')} • ${escape(entry.main_topic||entry.scenario||'')}</div>
            </div>
            <div class="row">
              <span class="pill" id="phaseLabel">Ready</span>
            </div>
          </div>
          <div class="panel-body">
            <div class="audio-wrap">
              <audio id="aud" preload="auto"></audio>
              <div class="audio-row">
                <button class="btn primary" id="btnPlayMain">Main Audio</button>
                <button class="btn secondary" id="btnPlayQ">Q Audio</button>
                <button class="btn ghost" id="btnStop">Stop</button>
              </div>
              <div class="muted small">Listening에서는 Main audio 끝나면 자동으로 질문 단계로 넘어가. (연습은 수동 선택)</div>
            </div>

            <div style="height:14px"></div>
            <div class="muted small" id="prompt">Main audio 재생 버튼을 눌러줘.</div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title" id="qTitle">Question</div>
            <div class="row">
              <button class="btn secondary" id="btnPrevQ" title="Prev"><img style="width:18px;height:18px;filter:none" src="assets/chev-left.svg"/></button>
              <span class="pill" id="qCounter">—</span>
              <button class="btn secondary" id="btnNextQ" title="Next"><img style="width:18px;height:18px;filter:none" src="assets/chev-right.svg"/></button>
            </div>
          </div>
          <div class="panel-body">
            <div class="qstem" id="qStem"></div>
            <div class="choices" id="choices"></div>
            <div style="height:12px"></div>
            <div class="row" style="gap:10px">
              <button class="btn ghost" id="btnCheck">채점</button>
              <div class="spacer"></div>
              <div class="muted small" id="result"></div>
            </div>
            <div style="height:10px"></div>
            <div class="row" style="gap:10px">
              <button class="btn ghost" id="btnScript">스크립트</button>
              <button class="btn ghost" id="btnAnswerKey">정답 보기</button>
            </div>
          </div>
        </section>
      </div>
    `;

    // Listening section flag (block seeking)
    setSectionIsListening(()=>true);

    let ent;
    try{
      ent = await loadListeningSet(entry.folder, (await window.TOEFL.detectListeningRoot?.()) || entry.path.replace(/\/Listening_Set_.+$/,''));
      // NOTE: loadListeningSet expects (set, root). We passed folder as "set" string; root adjusted by detect.
      // If detect isn't available, entry.path has full.
      if(!ent || !ent.questions) throw new Error('set load fail');
    }catch(e){
      // fallback: use entry.path directly
      const root = entry.path.replace(/\/Listening_Set_.+$/,'');
      ent = await loadListeningSet(entry.folder, root);
    }

    const aud = $('#aud');
    secureAudio(aud);

    let phase = 'ready'; // ready | main | qAudio | answer
    let qIndex = 0;
    let waitingAnswer = false;

    function play(url){
      try{
        aud.pause();
        aud.src = url;
        aud.currentTime = 0;
        aud.play().catch(()=>{});
      }catch(e){}
    }

    function renderPlaceholder(text){
      $('#prompt').textContent = text;
      $('#qTitle').textContent = `Question`;
      $('#qStem').textContent = '';
      $('#choices').innerHTML = '';
      $('#result').textContent = '';
      $('#qCounter').textContent = '—';
    }

    function renderQ(){
      const q = ent.questions[qIndex];
      $('#qTitle').textContent = `Question ${q.num}`;
      $('#qCounter').textContent = `${String(qIndex+1).padStart(2,'0')}/${String(ent.questions.length).padStart(2,'0')}`;
      $('#qStem').textContent = q.stem || '';
      $('#choices').innerHTML = '';

      for(const c of q.choices){
        const el = document.createElement('button');
        el.className = 'choice';
        el.type = 'button';
        el.innerHTML = `<span class="letter">${c.letter}</span><span class="text">${escape(c.text)}</span>`;
        el.onclick = ()=>{
          q.selected = c.letter;
          for(const b of $$('.choice', $('#choices'))) b.classList.remove('selected');
          el.classList.add('selected');
          $('#result').textContent = '';
        };
        if(q.selected === c.letter) el.classList.add('selected');
        $('#choices').appendChild(el);
      }
    }

    function grade(){
      const q = ent.questions[qIndex];
      if(!q.selected){ toast('답을 선택해줘'); return; }
      const ok = q.selected === q.answer;
      $('#result').textContent = ok ? '정답!' : `오답 (정답: ${q.answer})`;

      // highlight
      const wrap = $('#choices');
      const choices = $$('.choice', wrap);
      for(const el of choices){
        const letter = el.querySelector('.letter')?.textContent?.trim();
        el.classList.remove('correct','wrong');
        if(letter === q.answer) el.classList.add('correct');
        if(letter === q.selected && q.selected !== q.answer) el.classList.add('wrong');
      }
    }

    function gotoQuestion(newIdx){
      qIndex = Math.max(0, Math.min(ent.questions.length-1, newIdx));
      phase = 'answer';
      waitingAnswer = true;
      $('#phaseLabel').textContent = `Answer (Q${ent.questions[qIndex].num})`;
      $('#prompt').textContent = '답을 고르고 채점(또는 다음 질문으로 이동)해줘.';
      renderQ();
    }

    function playMain(){
      phase = 'main';
      $('#phaseLabel').textContent = 'Main audio...';
      waitingAnswer = false;
      qIndex = 0;
      renderPlaceholder('Main audio 재생 중…');
      play(`${ent.path}/listening.mp3`);
    }

    function playQuestionAudio(){
      if(phase === 'main'){ toast('Main audio 끝난 뒤에'); return; }
      phase = 'qAudio';
      const qnum = ent.questions[qIndex].num;
      $('#phaseLabel').textContent = `Question ${qnum} audio...`;
      waitingAnswer = false;
      renderPlaceholder('Question audio 재생 중…');
      play(ent.questions[qIndex].audio);
    }

    function stopAll(){
      try{ aud.pause(); }catch(e){}
      phase = 'ready';
      waitingAnswer = false;
      $('#phaseLabel').textContent = 'Ready';
      renderPlaceholder('Main audio 재생 버튼을 눌러줘.');
    }

    aud.addEventListener('ended', ()=>{
      if(phase === 'main'){
        // main 끝나면 자동으로 질문 단계로
        gotoQuestion(0);
      }else if(phase === 'qAudio'){
        // Q audio 끝나면 답안 단계
        phase = 'answer';
        waitingAnswer = true;
        $('#phaseLabel').textContent = `Answer (Q${ent.questions[qIndex].num})`;
        $('#prompt').textContent = '답을 고르고 채점(또는 다음 질문으로 이동)해줘.';
        renderQ();
      }
    });

    $('#btnPlayMain').onclick = ()=> playMain();
    $('#btnPlayQ').onclick = ()=> playQuestionAudio();
    $('#btnStop').onclick = ()=> stopAll();

    $('#btnPrevQ').onclick = ()=> gotoQuestion(qIndex-1);
    $('#btnNextQ').onclick = ()=> gotoQuestion(qIndex+1);

    $('#btnCheck').onclick = ()=> grade();

    $('#btnScript').onclick = async ()=>{
      try{
        const res = await fetch(`${ent.path}/script.txt`, { cache:'no-store' });
        if(!res.ok){ toast('script.txt 없음'); return; }
        const txt = await res.text();
        alert(txt);
      }catch(e){
        toast('스크립트 로드 실패');
      }
    };
    $('#btnAnswerKey').onclick = async ()=>{
      try{
        const res = await fetch(`${ent.path}/answer_key.txt`, { cache:'no-store' });
        if(!res.ok){ toast('answer_key.txt 없음'); return; }
        const txt = await res.text();
        alert(txt);
      }catch(e){
        toast('정답키 로드 실패');
      }
    };

    // init
    stopAll();
  }

  function renderSimEntry(){
    setWeek('Week');
    setSubbar('Simulation Test');
    setCounter('—');

    main.innerHTML = `
      <div class="hero">
        <div class="hero-card">
          <div class="kicker">Simulation Test</div>
          <div class="title">실전처럼 진행</div>
          <div class="muted">팝업으로 열리고, Listening은 오디오 종료 후 자동 진행.</div>
          <div style="height:12px"></div>
          <div class="muted small">시작 전 3초 준비 화면이 표시돼.</div>
          <div style="height:12px"></div>
          <button class="btn primary" id="btnStartSim">시작</button>
        </div>
        <div class="hero-card">
          <div class="kicker">Note</div>
          <div class="muted">
            - 시간 조정 불가<br/>
            - 오디오 임의 조작 제한<br/>
            - 종료 후 채점/리뷰 가능
          </div>
        </div>
      </div>
    `;

    $('#btnStartSim').onclick = ()=>{
      const w = window.open('sim.html', 'toefl_sim', 'width=1200,height=820');
      if(!w){
        toast('팝업이 차단됨. 팝업 허용해줘');
      }
    };
  }

  function renderNotFound(){
    setWeek('Week');
    setSubbar('Not Found');
    setCounter('—');
    main.innerHTML = `
      <div class="hero-card">
        <div class="kicker">404</div>
        <div class="title">페이지를 찾을 수 없어</div>
        <div style="height:12px"></div>
        <a class="btn secondary" href="#/">홈으로</a>
      </div>
    `;
  }

  // init
  window.addEventListener('hashchange', route);
  route();

})();
