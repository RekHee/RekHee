/* 관리자 페이지: 인라인 편집 + GitHub API로 content.json 커밋 */
(function () {
  const CFG_KEY = 'rekheeAdminCfg';
  const DRAFT_KEY = 'rekheeAdminDraft';
  const DEFAULT_CFG = { owner: 'RekHee', repo: 'RekHee', branch: 'main', path: 'content.json', token: '' };

  const $ = id => document.getElementById(id);
  const app = $('app');
  const { render, getPath } = window.RekheeRender;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let cfg = Object.assign({}, DEFAULT_CFG, JSON.parse(store.get(CFG_KEY) || '{}'));
  let data = null;        // 현재 편집 중인 데이터
  let savedJSON = '';     // 마지막으로 저장/불러온 상태
  let sha = null;         // GitHub 파일 sha
  let editing = false;

  const TEMPLATES = {
    'hero.pills': () => '✨ 새 태그',
    'world.story': () => ({ text: '새 문장을 입력하세요', goal: false }),
    'world.relationships': () => ({ emoji: '⭐', title: '새 인물', desc: '설명을 입력하세요' }),
    'traits.items': () => ({ emoji: '✨', title: '새 특이사항', desc: '설명을 입력하세요' }),
    'achievements.items': () => ({ title: '새 해금 목표', meta: '🔒 다음 목표', desc: '설명을 입력하세요', condition: '해금 조건: ', status: '잠김', unlocked: false })
  };

  // ---------- 유틸 ----------
  let toastTimer;
  function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), err ? 6000 : 4000);
  }
  const json = () => JSON.stringify(data, null, 2) + '\n';
  const isDirty = () => data && json() !== savedJSON;

  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    getPath(obj, keys.join('.'))[last] = val;
  }

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---------- 화면 ----------
  function draw() {
    render(app, data, { editing });
    updateDirty();
  }
  function updateDirty() {
    const d = isDirty();
    const el = $('dirty');
    el.textContent = d ? '저장 안 된 변경사항 있음' : '저장됨';
    el.classList.toggle('on', d);
  }
  function changed() {
    updateDirty();
    if (isDirty()) store.set(DRAFT_KEY, JSON.stringify(data)); else store.del(DRAFT_KEY);
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    $('editBtn').textContent = on ? '✅ 편집 완료' : '✏️ 내용 편집하기';
    draw();
  }

  // 글자 수정 → 데이터 반영
  app.addEventListener('input', e => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    setPath(data, el.dataset.path, el.innerHTML.replace(/&nbsp;/g, ' ').trim());
    changed();
  });
  // 붙여넣기는 서식 없이 글자만
  app.addEventListener('paste', e => {
    if (!e.target.closest('[data-path]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });
  // Enter는 줄바꿈(<br>)으로
  app.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('[data-path]')) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  });

  // 항목 추가/삭제/이동
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    const list = getPath(data, b.dataset.list);
    const i = Number(b.dataset.i);
    switch (b.dataset.act) {
      case 'add': list.push(TEMPLATES[b.dataset.list]()); break;
      case 'del': list.splice(i, 1); break;
      case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
      case 'down': if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
      case 'goal': list[i].goal = !list[i].goal; break;
      case 'lock': {
        const it = list[i];
        it.unlocked = !it.unlocked;
        if (it.unlocked && it.status === '잠김') it.status = '해금 성공!';
        if (!it.unlocked && it.status === '해금 성공!') it.status = '잠김';
        break;
      }
    }
    draw();
    changed();
  });

  // ---------- GitHub ----------
  const apiBase = () => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const contentsUrl = () => `${apiBase()}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
  function gh(url, opts) {
    return fetch(url, Object.assign({ cache: 'no-store' }, opts, {
      headers: Object.assign({
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + cfg.token,
        'X-GitHub-Api-Version': '2022-11-28'
      }, opts && opts.headers)
    }));
  }
  function ghError(status) {
    if (status === 401) return '토큰이 올바르지 않거나 만료됐어요.';
    if (status === 403) return '토큰에 쓰기 권한이 없어요. (Contents: Read and write 필요)';
    if (status === 404) return '저장소/브랜치/파일 경로를 찾을 수 없어요. ⚙️ 설정을 확인해주세요.';
    if (status === 409 || status === 422) return '다른 곳에서 먼저 수정됐어요. 새로고침 후 다시 시도해주세요.';
    return 'GitHub 오류 (' + status + ')';
  }
  async function ghGetFile() {
    const r = await gh(`${contentsUrl()}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(ghError(r.status));
    const j = await r.json();
    return { sha: j.sha, text: b64decode(j.content) };
  }

  // ---------- 잠금(관리자 확인) ----------
  // 토큰으로 저장소 쓰기 권한이 있는지 확인. 실패하면 에러를 던진다.
  async function verify(c) {
    if (!c.token) throw new Error('토큰을 입력해주세요.');
    const prev = cfg;
    cfg = c;
    try {
      const r = await gh(apiBase());
      if (!r.ok) throw new Error(ghError(r.status));
      const repo = await r.json();
      if (!repo.permissions || !repo.permissions.push) throw new Error(ghError(403));
    } catch (e) {
      cfg = prev;
      throw e;
    }
  }
  function lock(msg) {
    document.body.classList.add('locked');
    if (editing) setEditing(false);
    data = null;
    app.innerHTML = '';
    $('gateMsg').textContent = msg || '';
    $('gateToken').value = '';
    $('gateToken').focus();
  }
  async function unlock() {
    document.body.classList.remove('locked');
    $('gateMsg').textContent = '';
    app.innerHTML = '<p class="loading">불러오는 중…</p>';
    await load();
  }
  async function init() {
    if (!cfg.token) return lock();
    try {
      await verify(cfg);
      await unlock();
    } catch (e) {
      lock(e.message);
    }
  }
  $('gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('gateBtn');
    btn.disabled = true; btn.textContent = '확인 중…';
    $('gateMsg').textContent = '';
    try {
      const next = Object.assign({}, cfg, { token: $('gateToken').value.trim() });
      await verify(next);
      store.set(CFG_KEY, JSON.stringify(cfg));
      await unlock();
      toast('어서 오시오, 관리자여! 👑');
    } catch (err) {
      $('gateMsg').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = '입장하기';
    }
  });
  $('gateSettings').onclick = () => openSettings();
  $('logoutBtn').onclick = () => {
    if (isDirty() && !confirm('저장하지 않은 변경사항이 있어요. 그래도 로그아웃할까요?')) return;
    cfg = Object.assign({}, cfg, { token: '' });
    store.set(CFG_KEY, JSON.stringify(cfg));
    store.del(DRAFT_KEY);
    lock('로그아웃했어요.');
  };

  async function load() {
    let loaded = null;
    const f = await ghGetFile();
    if (f) { sha = f.sha; loaded = JSON.parse(f.text); }
    if (!loaded) {
      const r = await fetch('content.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('content.json을 불러올 수 없어요');
      loaded = await r.json();
    }
    data = loaded;
    savedJSON = json();

    const draft = store.get(DRAFT_KEY);
    if (draft && JSON.stringify(JSON.parse(draft), null, 2) + '\n' !== savedJSON &&
        confirm('저장하지 않은 편집 내용이 이 브라우저에 남아 있어요. 이어서 편집할까요?\n(취소를 누르면 임시 내용은 지워져요)')) {
      data = JSON.parse(draft);
    } else {
      store.del(DRAFT_KEY);
    }
    draw();
  }

  async function save() {
    if (editing && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!data || document.body.classList.contains('locked')) return;
    if (!isDirty() && sha) { toast('바뀐 내용이 없어요'); return; }
    const btn = $('saveBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 저장 중…';
    try {
      if (!sha) { const f = await ghGetFile(); sha = f ? f.sha : null; }
      const body = {
        message: '관리자 페이지에서 내용 수정 (' + new Date().toLocaleString('ko-KR') + ')',
        content: b64encode(json()),
        branch: cfg.branch
      };
      if (sha) body.sha = sha;
      const r = await gh(contentsUrl(), { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      if (r.status === 401) { lock(ghError(401)); return; }
      if (!r.ok) throw new Error(ghError(r.status));
      const j = await r.json();
      sha = j.content.sha;
      savedJSON = json();
      store.del(DRAFT_KEY);
      updateDirty();
      toast('저장 완료! 보통 1~2분 안에 사용자 페이지에 반영돼요 ✨');
    } catch (e) {
      toast('저장 실패: ' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 변경사항 저장';
    }
  }

  // ---------- 설정 ----------
  const dlg = $('settings');
  const form = $('settingsForm');
  function openSettings() {
    for (const k of Object.keys(DEFAULT_CFG)) form.elements[k].value = cfg[k];
    dlg.showModal();
  }
  form.addEventListener('submit', async e => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const next = {};
    for (const k of Object.keys(DEFAULT_CFG)) next[k] = form.elements[k].value.trim();
    const ok = $('settingsOk');
    ok.disabled = true; ok.textContent = '확인 중…';
    try {
      await verify(next);
      store.set(CFG_KEY, JSON.stringify(cfg));
      dlg.close();
      if (isDirty()) {
        // 편집 중이던 내용은 유지하고, 새 저장소의 sha만 다시 받아온다
        sha = null;
        const f = await ghGetFile().catch(() => null);
        if (f) sha = f.sha;
      } else {
        await unlock();
      }
      toast('GitHub 연결 완료! 👑');
    } catch (err) {
      toast('연결 실패: ' + err.message, true);
    } finally {
      ok.disabled = false; ok.textContent = '연결 확인 후 저장';
    }
  });

  // ---------- 버튼 ----------
  $('editBtn').onclick = () => setEditing(!editing);
  $('saveBtn').onclick = save;
  $('settingsBtn').onclick = openSettings;
  $('printBtn').onclick = () => window.print();
  $('revertBtn').onclick = () => {
    if (!isDirty()) { toast('되돌릴 변경사항이 없어요'); return; }
    if (!confirm('마지막으로 저장한 내용으로 되돌릴까요? 지금 편집한 내용은 사라져요.')) return;
    data = JSON.parse(savedJSON);
    store.del(DRAFT_KEY);
    draw();
  };
  $('exportBtn').onclick = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'content.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('content.json 을 내려받았어요. 저장소의 같은 파일에 덮어쓰고 커밋하면 반영돼요.');
  };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', e => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  init().catch(e => { app.innerHTML = `<p class="loading">${e.message}</p>`; });
})();
