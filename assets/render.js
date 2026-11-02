/* 사용자 페이지와 관리자 페이지가 함께 쓰는 렌더러.
   content.json 데이터를 받아 화면을 그린다. editing=true 이면 편집용 속성/버튼이 추가된다. */
(function () {
  const pad = n => String(n).padStart(2, '0');

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function render(root, d, opt) {
    const ed = !!(opt && opt.editing);

    // 편집 가능한 요소 하나
    const E = (path, tag, cls) => {
      const val = getPath(d, path);
      const c = cls ? ` class="${cls}"` : '';
      const a = ed ? ` data-path="${path}" contenteditable="true" spellcheck="false"` : '';
      return `<${tag}${c}${a}>${val == null ? '' : val}</${tag}>`;
    };

    // 목록 항목 조작 버튼 (위/아래/삭제 + 추가 버튼)
    const ctrls = (list, i, len, extra) => !ed ? '' :
      `<div class="item-ctrls">${extra || ''}` +
      `<button type="button" data-act="up" data-list="${list}" data-i="${i}" title="위로" ${i === 0 ? 'disabled' : ''}>↑</button>` +
      `<button type="button" data-act="down" data-list="${list}" data-i="${i}" title="아래로" ${i === len - 1 ? 'disabled' : ''}>↓</button>` +
      `<button type="button" data-act="del" data-list="${list}" data-i="${i}" title="삭제">✕</button></div>`;
    const add = (list, label) => !ed ? '' :
      `<button type="button" class="add-btn" data-act="add" data-list="${list}">＋ ${label} 추가</button>`;
    const item = ed ? ' editable-item' : '';

    const head = key =>
      `<div class="section-head">${E(key + '.icon', 'div', 'section-icon')}<div>${E(key + '.title', 'h2')}${E(key + '.sub', 'p', 'sub')}</div></div>`;

    const pills = d.hero.pills.map((_, i) =>
      `<span class="pill">${E(`hero.pills.${i}`, 'span')}${ed ? `<button type="button" class="pill-x" data-act="del" data-list="hero.pills" data-i="${i}" title="삭제">✕</button>` : ''}</span>`
    ).join('') + (ed ? `<button type="button" class="pill pill-add" data-act="add" data-list="hero.pills">＋ 태그</button>` : '');

    const story = d.world.story.map((s, i, a) =>
      `<div class="story-line${item}">${E(`world.story.${i}.text`, s.goal ? 'div' : 'p', s.goal ? 'goal' : '')}` +
      ctrls('world.story', i, a.length, `<button type="button" data-act="goal" data-list="world.story" data-i="${i}" title="강조 박스 켜기/끄기">★</button>`) +
      `</div>`
    ).join('');

    const rel = d.world.relationships.map((_, i, a) =>
      `<div class="mini${item}">${E(`world.relationships.${i}.emoji`, 'div', 'emoji')}${E(`world.relationships.${i}.title`, 'h3')}${E(`world.relationships.${i}.desc`, 'p')}${ctrls('world.relationships', i, a.length)}</div>`
    ).join('');

    const traits = d.traits.items.map((_, i, a) =>
      `<article class="trait${item}">${E(`traits.items.${i}.emoji`, 'div', 'emoji')}<div>${E(`traits.items.${i}.title`, 'h3')}${E(`traits.items.${i}.desc`, 'p')}</div>${ctrls('traits.items', i, a.length)}</article>`
    ).join('');

    const ach = d.achievements.items.map((it, i, a) => {
      const p = `achievements.items.${i}`;
      return `<article class="achievement${item}"><div class="number">${pad(i + 1)}</div><div>${E(p + '.title', 'h3')}${E(p + '.meta', 'div', 'meta')}${E(p + '.desc', 'p')}${E(p + '.condition', 'span', 'condition')}</div>` +
        E(p + '.status', 'span', it.unlocked ? 'status' : 'status lock') +
        ctrls('achievements.items', i, a.length, `<button type="button" data-act="lock" data-list="achievements.items" data-i="${i}" title="해금/잠김 전환">${it.unlocked ? '🔓' : '🔒'}</button>`) +
        `</article>`;
    }).join('');

    root.innerHTML = `
  <div class="topbar">${E('brand', 'div', 'brand')}</div>
  <header class="hero">
    ${E('hero.eyebrow', 'div', 'eyebrow')}
    ${E('hero.title', 'h1')}
    ${E('hero.lead', 'p')}
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
    ${head('achievements')}
    <div class="achievements">${ach}</div>
    ${add('achievements.items', '해금 목표')}
    <div class="secret">${E('achievements.secret.icon', 'div', 'lockicon')}<div>${E('achievements.secret.title', 'h3')}${E('achievements.secret.desc', 'p')}</div></div>
  </section>
  ${E('footer', 'footer', 'footer')}
  ${E('smallprint', 'div', 'smallprint')}`;

    const t = document.createElement('div');
    t.innerHTML = d.hero.title;
    document.title = (t.textContent || '렉희 사용 설명서') + ' | 렉희 왕국';
  }

  window.RekheeRender = { render, getPath };
})();
