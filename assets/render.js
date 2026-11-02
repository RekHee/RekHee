/* 사용자 페이지와 관리자 페이지가 함께 쓰는 렌더러.
   content.json 데이터를 받아 화면을 그린다. editing=true 이면 편집용 속성/버튼/설정 패널이 추가된다. */
(function () {
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  const attr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // 화면에 쓸 후궁 수: 자동 모드이고 자동 값이 있으면 그 값, 아니면 수동 입력 값
  function followerCount(d, live) {
    const f = d.followers || {};
    if (f.auto && live && typeof live.count === 'number') return live.count;
    return Number(f.count) || 0;
  }

  // 치지직 자동 값(followers.json) 불러오기. GitHub Actions가 주기적으로 갱신한다.
  async function loadFollowers(d) {
    const f = d.followers || {};
    if (!f.auto) return null;
    const urls = [f.source, 'followers.json'].filter(Boolean);
    for (const u of urls) {
      try {
        const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) continue;
        const j = await r.json();
        if (typeof j.count === 'number') return j;
      } catch (e) { /* 다음 주소 시도 */ }
    }
    return null;
  }

  function render(root, d, opt) {
    opt = opt || {};
    const ed = !!opt.editing;
    const live = opt.live || null;
    const display = d.display || {};
    const followers = followerCount(d, live);

    // 편집 가능한 글자 요소
    const E = (path, tag, cls) => {
      const val = getPath(d, path);
      const c = cls ? ` class="${cls}"` : '';
      const a = ed ? ` data-path="${path}" contenteditable="true" spellcheck="false"` : '';
      return `<${tag}${c}${a}>${val == null ? '' : val}</${tag}>`;
    };

    // 목록 항목 조작 버튼
    const ctrls = (list, i, len, extra) => !ed ? '' :
      `<div class="item-ctrls">${extra || ''}` +
      `<button type="button" data-act="up" data-list="${list}" data-i="${i}" title="위로" ${i === 0 ? 'disabled' : ''}>↑</button>` +
      `<button type="button" data-act="down" data-list="${list}" data-i="${i}" title="아래로" ${i === len - 1 ? 'disabled' : ''}>↓</button>` +
      `<button type="button" data-act="del" data-list="${list}" data-i="${i}" title="삭제">✕</button></div>`;
    const add = (list, label) => !ed ? '' :
      `<button type="button" class="add-btn" data-act="add" data-list="${list}">＋ ${label} 추가</button>`;
    const item = ed ? ' editable-item' : '';

    const head = key =>
      `<div class="sec-head">${E(key + '.icon', 'div', 'sec-icon')}${E(key + '.title', 'h2')}${E(key + '.sub', 'p', 'sub')}</div>`;

    // ---------- 관리자 설정 패널 (편집 모드에서만) ----------
    const f = d.followers || {};
    const panel = !ed ? '' : `
  <div class="admin-panel">
    <div class="ap-title">👑 왕국 현황 설정</div>
    <div class="ap-grid">
      <label class="ap-field">현재 후궁 수 (직접 입력)
        <input type="number" min="0" data-field="followers.count" data-type="num" value="${attr(f.count)}">
      </label>
      <label class="ap-field">치지직 채널 ID
        <input type="text" data-field="followers.channelId" data-type="str" value="${attr(f.channelId)}" placeholder="chzzk.naver.com/ 뒤의 32자리">
      </label>
    </div>
    <label class="ap-check"><input type="checkbox" data-field="followers.auto" data-type="bool" ${f.auto ? 'checked' : ''}> 치지직에서 후궁 수 자동으로 가져오기</label>
    <p class="ap-help">${f.auto
      ? (live ? `자동 값: <b>${live.count}명</b>${live.updatedAt ? ' · ' + new Date(live.updatedAt).toLocaleString('ko-KR') + ' 갱신' : ''} — 자동 값이 화면에 쓰여요.`
              : '아직 자동 값이 없어요. 채널 ID를 저장한 뒤 GitHub Actions가 돌면 생겨요. 그 전까지는 직접 입력한 값이 쓰여요.')
      : '직접 입력한 값이 화면에 쓰여요.'}</p>
    <div class="ap-row">
      <label class="ap-check"><input type="checkbox" data-field="display.showLocked" data-type="bool" ${display.showLocked !== false ? 'checked' : ''}> 잠긴 목표도 보여주기</label>
      <label class="ap-check"><input type="checkbox" data-field="display.showSecret" data-type="bool" ${display.showSecret !== false ? 'checked' : ''}> 비밀 프로젝트 보여주기</label>
    </div>
  </div>`;

    // ---------- 히어로 ----------
    const pills = d.hero.pills.map((_, i) =>
      `<span class="pill">${E(`hero.pills.${i}`, 'span')}${ed ? `<button type="button" class="pill-x" data-act="del" data-list="hero.pills" data-i="${i}" title="삭제">✕</button>` : ''}</span>`
    ).join('') + (ed ? `<button type="button" class="pill pill-add" data-act="add" data-list="hero.pills">＋ 태그</button>` : '');

    // ---------- 세계관 ----------
    const story = d.world.story.map((s, i, a) =>
      `<div class="story-line${item}">${E(`world.story.${i}.text`, 'p', s.goal ? 'goal' : '')}` +
      ctrls('world.story', i, a.length, `<button type="button" data-act="goal" data-list="world.story" data-i="${i}" title="크게 강조 켜기/끄기">★</button>`) +
      `</div>`
    ).join('');

    const rel = d.world.relationships.map((_, i, a) =>
      `<div class="mini${item}">${E(`world.relationships.${i}.emoji`, 'div', 'emoji')}<div class="mini-text">${E(`world.relationships.${i}.title`, 'h3')}${E(`world.relationships.${i}.desc`, 'p')}</div>${ctrls('world.relationships', i, a.length)}</div>`
    ).join('');

    // ---------- 특이사항 ----------
    const traits = d.traits.items.map((_, i, a) =>
      `<article class="trait${item}">${E(`traits.items.${i}.emoji`, 'div', 'emoji')}${E(`traits.items.${i}.title`, 'h3')}${E(`traits.items.${i}.desc`, 'p')}${ctrls('traits.items', i, a.length)}</article>`
    ).join('');

    // ---------- 해금 리스트 ----------
    const all = d.achievements.items;
    const unlockedCount = all.filter(a => a.unlocked).length;
    const showLocked = display.showLocked !== false;
    const ach = all.map((it, i, a) => {
      if (!ed && !showLocked && !it.unlocked) return '';
      const p = `achievements.items.${i}`;
      const target = Number(it.target) || 0;
      const pct = target ? Math.min(100, Math.round(followers / target * 100)) : 0;
      const bar = (!it.unlocked && target) ?
        `<div class="bar"><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>` +
        `<div class="bar-label">${followers >= target ? `🎉 목표 달성! ${followers} / ${target}명` : `${followers} / ${target}명 · ${pct}%`}</div></div>` : '';
      const targetField = !ed ? '' :
        `<label class="num-field">🎯 진행 바 목표 후궁 수 <input type="number" min="0" data-field="${p}.target" data-type="num" value="${attr(it.target)}" placeholder="없음"></label>`;
      const hidden = ed && !showLocked && !it.unlocked ? ' is-hidden' : '';
      return `<article class="ach ${it.unlocked ? 'on' : 'off'}${item}${hidden}">` +
        `<div class="ach-rail"><div class="ach-dot">${it.unlocked ? '♛' : '🔒'}</div><div class="ach-line"></div></div>` +
        `<div class="ach-body"><div class="ach-top">${E(p + '.meta', 'span', 'meta')}${E(p + '.status', 'span', 'status')}</div>` +
        `${E(p + '.title', 'h3')}${E(p + '.desc', 'p')}${E(p + '.condition', 'span', 'condition')}${bar}${targetField}</div>` +
        ctrls('achievements.items', i, a.length, `<button type="button" data-act="lock" data-list="achievements.items" data-i="${i}" title="해금/잠김 전환">${it.unlocked ? '🔓' : '🔒'}</button>`) +
        `</article>`;
    }).join('');

    const showSecret = display.showSecret !== false;
    const secret = (!ed && !showSecret) ? '' :
      `<div class="secret${ed && !showSecret ? ' is-hidden' : ''}">${E('achievements.secret.icon', 'div', 'lockicon')}<div class="secret-text">${E('achievements.secret.title', 'h3')}${E('achievements.secret.desc', 'p')}</div></div>`;

    root.innerHTML = `<div class="rk">
  ${panel}
  <header class="hero">
    ${E('brand', 'div', 'brand')}
    <div class="crown" aria-hidden="true">♛</div>
    <div class="hero-titles">${E('hero.eyebrow', 'div', 'eyebrow')}${E('hero.title', 'h1')}</div>
    ${E('hero.lead', 'p', 'lead')}
    ${E('hero.welcome', 'p', 'welcome')}
    <div class="pills">${pills}</div>
  </header>

  <section class="section">
    ${head('world')}
    <div class="story">${story}${add('world.story', '문장')}</div>
    <div class="relationships">${rel}</div>
    ${add('world.relationships', '인물')}
  </section>

  <section class="section">
    ${head('traits')}
    <div class="traits">${traits}</div>
    ${add('traits.items', '특이사항')}
  </section>

  <section class="section">
    <div class="sec-head">${E('achievements.icon', 'div', 'sec-icon')}${E('achievements.title', 'h2')}${E('achievements.sub', 'p', 'sub')}
      <div class="kingdom-status"><span class="heart">💗</span><span>현재 후궁 <strong>${followers}</strong>명 · 진행 중 ${unlockedCount}/${all.length} 해금</span></div>
    </div>
    <div class="achievements">${ach}</div>
    ${add('achievements.items', '해금 목표')}
    ${secret}
  </section>

  <footer class="footer">
    <div class="crown-sm" aria-hidden="true">♛</div>
    ${E('footer', 'div', 'footer-text')}
    ${E('smallprint', 'div', 'smallprint')}
  </footer>
</div>`;

    const t = document.createElement('div');
    t.innerHTML = d.hero.title;
    document.title = (t.textContent || '렉희 사용 설명서') + ' | 렉희 왕국';
  }

  window.RekheeRender = { render, getPath, loadFollowers, followerCount };
})();
