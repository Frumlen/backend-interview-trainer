/* ===================================================================
 * UI: экраны (views). Каждый возвращает HTML-строку для <main>.
 * Состояние интерфейса — App.ui; учебный прогресс — только через engine.
 * =================================================================== */

const App = {
  repo: null,
  progress: null,
  engine: null,
  selector: null,
  source: "embedded",
  validation: null,
  ui: {
    route: "home",
    params: [],
    conceptId: null,
    revealed: {},
    story: {},
    visualStep: {},
    worked: {},
    practice: {},
    session: null,
    filters: { domain: "", level: "", difficulty: "", status: "", due: false, practice: false, fm: false, worked: false },
    filtersOpen: false,
    search: "",
    practiceTab: "tasks",
    examCfg: { size: 20, domains: [], keyqOnly: false },
  },
};

const LEARN_SECTIONS = [
  { key: "mechanism", title: "Как работает", next: "Почему так? Показать механизм" },
  { key: "example", title: "Минимальный пример", next: "Показать пример" },
  { key: "details", title: "Детали и ловушки", next: "Показать детали и инварианты" },
  { key: "failures", title: "Что может сломаться", next: "Показать failure modes" },
  { key: "tradeoffs", title: "Trade-offs и применение", next: "Показать trade-offs" },
  { key: "comparison", title: "Сравнение", next: "Сравнить с альтернативами" },
  { key: "worked", title: "Готовые решения", next: "Разобрать готовое решение" },
  { key: "practice", title: "Практика", next: "Практические задачи" },
  { key: "claims", title: "Спорные утверждения", next: "Что в материале требует проверки" },
];

function sectionAvailable(c, key) {
  switch (key) {
    case "mechanism": return !!(c.mechanism && ((c.mechanism.steps || []).length || (c.mechanism.important_distinctions || []).length));
    case "example": return !!(c.minimal_example && (c.minimal_example.code || c.minimal_example.explanation));
    case "details": return !!((c.details || []).length || (c.invariants || []).length);
    case "failures": return !!(c.failure_modes || []).length;
    case "tradeoffs": return !!(c.tradeoffs && ((c.tradeoffs.benefits || []).length || (c.tradeoffs.costs || []).length)) || !!(c.usage && (c.usage.use_when || []).length);
    case "comparison": return !!(c.comparison || []).length;
    case "worked": return !!(c.worked_examples || []).length;
    case "practice": return !!(c.practice || []).length;
    case "claims": return !!(c.claims || []).length;
    default: return false;
  }
}

function revealedSet(cid) {
  if (!App.ui.revealed[cid]) App.ui.revealed[cid] = [];
  return App.ui.revealed[cid];
}

/* ---------- HOME / PROGRESS ---------- */

function viewHome() {
  const e = App.engine;
  const o = e.overview();
  const meta = App.repo.meta;
  const next = e.nextToLearn(5);
  const weak = e.weakConcepts(6);
  const lastExam = (App.progress.data.exams || []).slice(-1)[0];
  const stat = (v, l) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const cont = next[0];
  const pctDone = o.total ? Math.round(((o.counts.mastered + o.counts.review) / o.total) * 100) : 0;
  let h = `<div class="page wide">
  <section class="hero">
    <h1>${esc(meta.title || "Курс")}</h1>
    <div class="muted">${md(meta.description || "")}</div>
    <div class="session-bar" style="margin:14px 0 4px"><span>Курс пройден на ${pctDone}%</span><div class="progressbar" aria-hidden="true"><div style="width:${pctDone}%"></div></div></div>
    <div class="actions">
      ${o.due ? `<a class="btn primary big" href="#review" data-primary>Повторить сегодня · ${o.due}</a>` : ""}
      ${cont ? `<a class="btn ${o.due ? "" : "primary"} big" href="#concept/${esc(cont.id)}" ${o.due ? "" : "data-primary"}>${o.viewed ? "Продолжить" : "Начать"}: ${esc(cont.title)}</a>` : ""}
      ${App.repo.questions.some((q) => q.key_question) ? `<a class="btn big" href="#keyq">Ключевые вопросы</a>` : ""}
    </div>
  </section>`;
  if (App.source === "custom") h += `<div class="banner warn"><span class="grow">Загружен пользовательский курс из localStorage.</span><a class="btn" href="#settings">Настройки курса</a></div>`;
  h += `<div class="stats">
    ${o.keyqTotal ? stat(`${o.keyqDone}<span class="muted small"> / ${o.keyqTotal}</span>`, "Ключевые вопросы: вспомнил").replace('class="stat"', 'class="stat green"') : ""}
    ${stat(o.due, "К повторению сегодня").replace('class="stat"', 'class="stat yellow"')}
    ${stat(o.accuracy == null ? "—" : pct(o.accuracy) + "%", `Recall за 30 дней${o.attemptsRecent ? ` · ${o.attemptsRecent} ответов` : ""}`).replace('class="stat"', 'class="stat blue"')}
    ${stat(`${o.viewed}<span class="muted small"> / ${o.total}</span>`, "Тем открыто")}
  </div>
  <div class="legend" style="margin:-4px 0 18px"><span>${stateIcon("mastered")} освоено ${o.counts.mastered}</span><span>${stateIcon("review")} на повторении ${o.counts.review}</span><span>${stateIcon("learning")} изучается ${o.counts.learning}</span><span>${stateIcon("new")} новые ${o.counts.new}</span><span class="muted">практика ${o.practiceDone}/${o.practiceTotal}</span></div>`;
  if (o.due) {
    h += `<p class="small muted">Сегодня: critical ${o.byPriority.critical} · important ${o.byPriority.important} · optional ${o.byPriority.secondary}</p>`;
  }
  h += `<div class="two-col">
    <div class="card"><div class="section-title">Слабые концепции</div>
      ${weak.length ? `<div class="list-links">${weak.map(({ c, st }) => `<a href="#concept/${esc(c.id)}">${stateIcon(st.state)}<span>${esc(c.title)}</span><span class="r">ср. ${st.avgScore.toFixed(1)}/3</span></a>`).join("")}</div>` : `<p class="muted small">Пока нет — появятся после первых попыток recall.</p>`}
    </div>
    <div class="card"><div class="section-title">Рекомендуемый маршрут</div>
      ${next.length ? `<div class="list-links">${next.map((c) => `<a href="#concept/${esc(c.id)}">${stateIcon("new")}<span>${esc(c.title)}</span><span class="r">${esc(App.repo.domainPath(c)[0])}</span></a>`).join("")}</div>` : `<p class="muted small">Все концепты уже начаты.</p>`}
      <p class="small" style="margin-top:8px"><a href="#map">Вся карта знаний →</a></p>
    </div>
  </div>`;
  h += `<div class="card"><div class="section-title">Прогресс по доменам</div>
    <div class="legend" style="margin-bottom:8px"><span>${stateIcon("mastered")} освоено</span><span>${stateIcon("review")} повторение</span><span>${stateIcon("learning")} изучается</span><span>${stateIcon("new")} новое</span></div>
    ${App.repo.domainTree().map((d) => {
      const ids = collectDomainConcepts(d);
      const cnt = { mastered: 0, review: 0, learning: 0, new: 0 };
      ids.forEach((id) => cnt[e.conceptState(id)]++);
      const w = (n) => (ids.length ? (n / ids.length) * 100 : 0);
      return `<div class="bar-row"><span>${esc(d.name)}</span><div class="bar" role="img" aria-label="${esc(d.name)}: освоено ${cnt.mastered}, повторение ${cnt.review}, изучается ${cnt.learning} из ${ids.length}">
        <span class="b-mastered" style="width:${w(cnt.mastered)}%"></span><span class="b-review" style="width:${w(cnt.review)}%"></span><span class="b-learning" style="width:${w(cnt.learning)}%"></span></div>
        <span class="n">${cnt.mastered + cnt.review}/${ids.length}</span></div>`;
    }).join("")}
    <p class="muted small" style="margin-top:10px">Проценты и состояния — UX-индикатор по твоим самооценкам, а не точная оценка знаний.</p>
  </div>`;
  if (lastExam) {
    h += `<div class="card"><div class="section-title">Последний экзамен</div>${renderExamLevels(lastExam.by_level)}<p class="small muted">${new Date(lastExam.date).toLocaleString("ru-RU")} · ${lastExam.total} вопросов</p></div>`;
  }
  h += `</div>`;
  return h;
}

function collectDomainConcepts(node) {
  return node.conceptIds.concat(...node.children.map(collectDomainConcepts));
}

/* ---------- LEARN: концепт ---------- */

function viewConcept(cid) {
  const repo = App.repo;
  const c = repo.getConcept(cid);
  if (!c) return viewNotFound(`Концепт «${cid}» не найден`);
  App.ui.conceptId = cid;
  App.progress.markViewed(cid, App.engine.now());
  const st = App.engine.conceptStats(cid);
  const chain = repo.prerequisiteChain(cid);
  const related = repo.getRelatedConcepts(cid);
  const revealed = revealedSet(cid);
  const available = LEARN_SECTIONS.filter((s) => sectionAvailable(c, s.key));
  const path = repo.domainPath(c);
  const parent = repo.parentOf(cid);

  let h = `<article class="page" aria-labelledby="concept-title">
  <div class="crumbs">${path.map(esc).join(" / ")}${parent ? ` / <a href="#concept/${esc(parent)}">${esc(repo.getConcept(parent).title)}</a>` : ""}</div>
  <header class="concept-head">
    <h1 id="concept-title" tabindex="-1">${esc(c.title)}</h1>
    <div class="badges">${levelBadge(c.level)} ${stars(repo.conceptDifficulty(cid))} <span class="badge">${stateLabel(st.state)}</span>
      ${c.origin === "extra" ? extraBadge() : ""}
      ${st.due ? `<span class="due-dot">к повторению: ${st.due}</span>` : ""}</div>
    <div class="meta">
      ${chain.length ? `<div class="prereq-chain"><span class="muted">Prerequisites:</span> ${chain.map((p) => `<a href="#concept/${esc(p)}">${stateIcon(App.engine.conceptState(p))}${esc(repo.getConcept(p).title)}</a><span class="arr">→</span>`).join(" ")} <strong>${esc(c.title)}</strong></div>` : ""}
      ${related.length ? `<div><span class="muted">Связано:</span> ${related.slice(0, 8).map((r) => `<a href="#concept/${esc(r.concept.id)}" title="${esc(r.relation)}">${esc(r.concept.title)}</a>`).join(" · ")}</div>` : ""}
      ${st.attempted ? renderConceptBars(st) : ""}
    </div>
  </header>`;

  if (st.attempted && st.state !== "new" && st.due) {
    h += `<div class="banner"><span class="grow">Ты уже изучал этот концепт, и часть вопросов пора повторить. Сначала вспомни, потом перечитывай.</span>
      <button class="btn primary" data-action="start-recall" data-id="${esc(cid)}" data-primary>Сначала вспомнить</button></div>`;
  }

  const hasShort = !!c.short_answer;
  const tab = hasShort ? Settings.get().concept_tab : "story";
  const storyObj = c.story && (c.story.beats || []).length ? c.story : null;
  if (hasShort) h += renderConceptTabs(tab, !!storyObj);
  if (hasShort && tab === "short") return h + renderShortAnswer(c) + `</article>`;

  const story = storyObj;
  const storyShown = story ? Math.min(App.ui.story[cid] || 0, story.beats.length) : 0;
  const storyDone = !story || storyShown >= story.beats.length;
  if (story) h += renderStory(cid, story, storyShown);
  if (!storyDone) return h + `</article>`;

  h += `<nav class="section-nav" aria-label="Разделы концепта">${available.map((s) => `<button class="chip ${revealed.includes(s.key) ? "seen" : ""}" data-action="reveal-section" data-section="${s.key}">${esc(s.title)}</button>`).join("")}
    <button class="chip" data-action="reveal-all">Показать всё</button></nav>`;

  h += `<section class="card" id="summary"><div class="section-title">${story ? "Итог — как ответить на интервью" : "TL;DR"}</div><div class="tldr">${md(c.summary)}</div></section>`;
  if (c.mental_model && c.mental_model.type && c.mental_model.type !== "none") {
    h += `<section class="card"><div class="section-title">${story ? "Как держать в голове" : "Mental model"} · ${esc(c.mental_model.type)}</div>${renderMentalModel(c.mental_model)}</section>`;
  }
  if (!story && c.problem && c.problem.question) {
    h += `<section class="card"><div class="section-title">Какую проблему решает</div><div class="problem">
      <div class="q">${mdInline(c.problem.question)}</div>${c.problem.context ? `<div>${md(c.problem.context)}</div>` : ""}
      ${c.problem.why_it_matters ? `<div class="small muted" style="margin-top:6px">Почему важно: ${mdInline(c.problem.why_it_matters)}</div>` : ""}</div></section>`;
  }

  for (const s of available) {
    if (!revealed.includes(s.key)) continue;
    h += `<section class="card" id="sec-${s.key}"><h2>${esc(s.title)}</h2>${renderLearnSection(c, s.key)}</section>`;
  }

  const nextSec = available.find((s) => !revealed.includes(s.key));
  const explainQ = pickExplainQuestion(cid);
  h += `<div class="disclose-next">
    ${nextSec ? `<button class="btn ${st.due ? "" : "primary"}" data-action="reveal-section" data-section="${nextSec.key}" ${st.due ? "" : "data-primary"}>${esc(nextSec.next)} →</button>` : ""}
    <button class="btn ${nextSec ? "" : "primary"}" data-action="start-recall" data-id="${esc(cid)}">Теперь вспомни сам (Recall) · ${repo.getQuestions(cid).length}</button>
    ${explainQ ? `<button class="btn ghost" data-action="start-single" data-id="${esc(explainQ)}">Объяснить своими словами</button>` : ""}
  </div>
  </article>`;
  return h;
}

const ANSWER_LEVELS = {
  junior: ["Junior", "что это и зачем"],
  middle: ["Middle", "+ как работает и когда применять"],
  senior: ["Senior", "+ trade-offs, отказы, нюансы в production"],
};

function renderConceptTabs(tab, hasStory) {
  return `<div class="view-tabs" role="tablist" aria-label="Подача материала">
    <button role="tab" aria-selected="${tab !== "short"}" data-action="concept-tab" data-tab="story">${hasStory ? "История" : "Материал"}</button>
    <button role="tab" aria-selected="${tab === "short"}" data-action="concept-tab" data-tab="short">Кратко: Junior · Middle · Senior</button></div>`;
}

function renderLevelVisuals(c, lvl) {
  const vis = (c.short_answer.visuals && c.short_answer.visuals[lvl]) || [];
  if (!vis.length) return "";
  return `<div class="visuals">${vis.map((v, i) => {
    const vid = `${c.id}:${lvl}:${i}`;
    return Visuals.render(v, vid, App.ui.visualStep[vid]);
  }).join("")}</div>`;
}

function renderShortAnswer(c) {
  const lvl = Settings.get().answer_level;
  return `<section class="card short-answer" id="short-answer">
    <div class="seg" role="group" aria-label="Уровень ответа">${Object.entries(ANSWER_LEVELS).map(([k, [t]]) => `<button data-action="answer-level" data-level="${k}" aria-pressed="${lvl === k}">${t}</button>`).join("")}</div>
    <p class="small muted" style="margin:10px 0 8px">${ANSWER_LEVELS[lvl][0]}: ${ANSWER_LEVELS[lvl][1]}. Каждый уровень — самостоятельный ответ на интервью, старший глубже.</p>
    <div class="answer-text">${md(c.short_answer[lvl])}</div>
    ${renderLevelVisuals(c, lvl)}</section>
    <div class="disclose-next"><button class="btn primary" data-action="start-recall" data-id="${esc(c.id)}" data-primary>Проверить себя (Recall) · ${App.repo.getQuestions(c.id).length}</button>
    <button class="btn ghost" data-action="concept-tab" data-tab="story">Читать историю</button></div>`;
}

/** История «проблема → решение»: каждое решение открывается только после того, как пользователь подумал сам. */
function renderStory(cid, story, shown) {
  const beats = story.beats;
  const done = shown >= beats.length;
  let h = `<section class="card story" aria-label="Объяснение через проблемы">
    <div class="section-title">Объяснение через проблемы · ${Math.min(shown + (done ? 0 : 1), beats.length)}/${beats.length} ${story.origin === "extra" ? extraBadge("Объяснение написано для курса; факты для ответа на интервью — в «Итоге»") : ""}</div>
    ${story.intro ? `<div class="story-intro">${md(story.intro)}</div>` : ""}<ol class="beats">`;
  beats.forEach((b, i) => {
    if (i > shown) return;
    const open = i < shown;
    h += `<li class="beat ${open ? "open" : "current"}" id="beat-${i}">
      <div class="bp"><span class="bn">Проблема ${i + 1}</span>${md(b.problem)}</div>`;
    if (open) {
      h += `<div class="bs"><span class="bn">Решение</span>${md(b.solution)}
        ${b.term ? `<div class="beat-term"><span class="muted small">Так это называется:</span> <strong>${mdInline(b.term)}</strong></div>` : ""}
        ${b.analogy ? `<div class="analogy">${mdInline(b.analogy)}</div>` : ""}</div>`;
    } else {
      h += `<p class="think">Подумай, как бы ты это решил, — потом открой ответ.</p>
        <div class="actions"><button class="btn primary" data-action="story-next" data-id="${esc(cid)}" data-reveal data-primary>Показать решение <kbd>Space</kbd></button>
        <button class="btn ghost" data-action="story-skip" data-id="${esc(cid)}">Пропустить объяснение</button></div>`;
    }
    h += `</li>`;
  });
  h += `</ol>`;
  if (done) {
    if (story.outro) h += `<div class="story-outro">${md(story.outro)}</div>`;
    h += `<div class="actions"><button class="btn ghost" data-action="story-restart" data-id="${esc(cid)}">Пройти объяснение заново</button></div>`;
  }
  return h + `</section>`;
}

function pickExplainQuestion(cid) {
  const qs = App.repo.getQuestions(cid);
  const ex = qs.find((q) => q.type === "explain") || qs.find((q) => q.level === "L2");
  return ex ? ex.id : null;
}

function renderConceptBars(st) {
  const row = (label, v) => v == null ? "" : `<div class="bar-row" style="margin:2px 0"><span class="small">${label}</span><div class="bar"><span class="b-acc" style="width:${pct(v)}%"></span></div><span class="n">${pct(v)}%</span></div>`;
  return `<details><summary class="small muted" style="cursor:pointer">Прогресс концепта: ${st.attempted}/${st.total} вопросов пройдено</summary>
    ${row("Recall (L1)", st.bars.recall)}${row("Understanding (L2)", st.bars.understanding)}${row("Application (L3–L6)", st.bars.application)}
    <div class="muted small">UX-индикатор по последним самооценкам.</div></details>`;
}

function renderLearnSection(c, key) {
  switch (key) {
    case "mechanism": return renderMechanism(c.mechanism);
    case "example": return renderExample(c.minimal_example);
    case "details": return renderDetails(c.details, c.invariants);
    case "failures": return renderFailureModes(c.failure_modes, c.id);
    case "tradeoffs": return renderTradeoffs(c.tradeoffs, c.usage);
    case "comparison": return renderComparison(c.comparison, App.repo, c.title);
    case "worked": return (c.worked_examples || []).map((w) => renderWorkedInteractive(App.repo.getWorked(w.id))).join("");
    case "practice": return `<div class="list-links">${(c.practice || []).map((p) => practiceLink(App.repo.getPractice(p.id))).join("")}</div>`;
    case "claims": return renderClaims(c.claims);
    default: return "";
  }
}

/* ---------- Worked example: blind / guided ---------- */

function renderWorkedInteractive(w) {
  const st = App.ui.worked[w.id] || { mode: "blind", step: 0 };
  const steps = (w.solution && w.solution.steps) || [];
  let h = `<div class="card flat ${w.origin === "extra" ? "is-extra" : ""}" style="background:var(--surface-2)">
    <h3>${esc(w.title)} ${w.origin === "extra" ? extraBadge() : ""}</h3>
    <div class="section-title">Задача</div>${md(w.problem)}${w.context ? `<div class="q-context">${md(w.context)}</div>` : ""}`;
  if (st.mode === "blind") {
    h += `<div class="answer-box"><label for="wd-${esc(w.id)}">Попробуй решить сам (черновик не сохраняется)</label>
      <textarea id="wd-${esc(w.id)}" class="short" data-draft="worked:${esc(w.id)}">${esc(st.draft || "")}</textarea></div>
      <div class="actions"><button class="btn" data-action="worked-show" data-id="${esc(w.id)}">Показать решение</button>
      ${steps.length > 1 ? `<button class="btn ghost" data-action="worked-step" data-id="${esc(w.id)}">Пошагово</button>` : ""}</div>`;
  } else {
    const shown = st.mode === "shown" ? steps.length : st.step;
    h += `<div class="section-title" style="margin-top:12px">Решение</div><ol class="steps">${steps.slice(0, shown).map((s) => `<li>${md(s)}</li>`).join("")}</ol>`;
    if (shown < steps.length) {
      h += `<div class="actions"><button class="btn" data-action="worked-step" data-id="${esc(w.id)}">Следующий шаг (${shown}/${steps.length})</button>
        <button class="btn ghost" data-action="worked-show" data-id="${esc(w.id)}">Показать всё</button></div>`;
    } else {
      if (w.solution && w.solution.code) h += codeBlock(w.solution.code, "");
      if (w.why_it_works) h += `<div class="section-title" style="margin-top:12px">Почему работает</div>${md(w.why_it_works)}`;
      if ((w.alternatives || []).length) h += `<div class="section-title" style="margin-top:12px">Альтернативы</div>${strList(w.alternatives)}`;
      if ((w.tradeoffs || []).length) h += `<div class="section-title" style="margin-top:12px">Trade-offs</div>${strList(w.tradeoffs)}`;
      if ((w.common_mistakes || []).length) h += `<div class="section-title" style="margin-top:12px">Типичные ошибки</div>${strList(w.common_mistakes)}`;
      h += `<div class="actions"><button class="btn ghost" data-action="worked-reset" data-id="${esc(w.id)}">Скрыть решение</button></div>`;
    }
  }
  return h + `</div>`;
}

/* ---------- RECALL / REVIEW сессии ---------- */

function newSession(kind, opts = {}) {
  const s = {
    kind,
    title: opts.title || "",
    conceptId: opts.conceptId || null,
    queue: opts.queue || [],
    index: 0,
    asked: [],
    results: [],
    retry: [],
    retried: [],
    limit: opts.limit || 0,
    cur: null,
    lastScore: null,
    lastLevel: null,
    done: false,
    route: opts.route || "#recall",
  };
  const first = opts.first || (s.queue.length ? s.queue[0] : null);
  if (!first) { s.done = true; return s; }
  setCurrent(s, first);
  return s;
}

function setCurrent(s, qid) {
  s.cur = { qid, phase: "answer", answer: "", checked: [], kpTouched: false, hints: 0, dontKnow: false, mc: null, simplifiedFrom: null };
}

function startConceptRecall(cid) {
  const first = App.selector.firstInConcept(cid);
  const c = App.repo.getConcept(cid);
  App.ui.session = newSession("recall", { conceptId: cid, first, title: `Recall: ${c.title}`, route: "#recall" });
  go("#recall");
}

function startSmart() {
  const pick = App.selector.selectNext(new Set());
  App.ui.session = newSession("smart", { first: pick && pick.qid, title: "Умная тренировка", limit: 15, route: "#recall" });
  if (pick) App.ui.session.reason = pick.reason;
  go("#recall");
}

function startReview(warmup = false) {
  const limit = Settings.get().daily_review_limit;
  const queue = warmup ? App.selector.warmupQueue(10) : App.selector.reviewQueue(limit);
  App.ui.session = newSession("review", { queue, title: warmup ? "Разогрев: новые вопросы" : "Повторение", route: "#review" });
  go("#review");
}

function startSingle(qid) {
  const q = App.repo.getQuestion(qid);
  if (!q) return;
  App.ui.session = newSession("single", { first: qid, title: "Вопрос", route: `#question/${qid}` });
  go(`#question/${qid}`);
}

function sessionAdvance(s) {
  s.asked.push(s.cur.qid);
  const asked = new Set(s.asked);
  let next = null;
  if (s.kind === "recall") {
    next = App.selector.nextInConcept(s.conceptId, asked, s.lastScore, s.lastLevel);
  } else if (s.kind === "review") {
    s.index++;
    next = s.queue[s.index] || null;
  } else if (s.kind === "smart") {
    if (s.asked.length < s.limit) {
      const pick = App.selector.selectNext(asked);
      next = pick && pick.qid;
      s.reason = pick && pick.reason;
    }
  }
  if (!next && s.retry.length) {
    next = s.retry.shift();
    s.retried.push(next);
    s.isRetry = true;
  } else {
    s.isRetry = false;
  }
  if (next) setCurrent(s, next);
  else { s.done = true; s.cur = null; }
}

function viewSession(s) {
  if (!s) return "";
  if (s.done) return viewSessionDone(s);
  const q = App.repo.getQuestion(s.cur.qid);
  if (!q) { s.done = true; return viewSessionDone(s); }
  const total = s.kind === "review" ? s.queue.length : s.kind === "recall" ? App.repo.getQuestions(s.conceptId).length : s.kind === "smart" ? s.limit : 1;
  const n = s.asked.length + 1;
  let h = `<div class="page">
  <div class="session-bar"><strong>${esc(s.title)}</strong>${s.reason && s.kind === "smart" ? `<span class="badge">${esc(s.reason)}</span>` : ""}${s.isRetry ? `<span class="badge important">повтор ошибки</span>` : ""}
    <div class="progressbar" aria-hidden="true"><div style="width:${Math.min(100, ((n - 1) / Math.max(1, total)) * 100)}%"></div></div>
    <span>${Math.min(n, total)} / ${total}</span>
    <button class="btn ghost" data-action="end-session">Завершить</button></div>
  <section class="card q-card" aria-labelledby="q-text">
    ${questionMeta(q, App.repo)}
    ${renderQuestionBody(q)}`;
  if (s.cur.phase === "answer") h += renderAnswerPhase(q, s);
  else h += renderRevealPhase(q, s);
  h += `</section></div>`;
  return h;
}

function renderAnswerPhase(q, s) {
  const cur = s.cur;
  let h = "";
  if (q.type === "multiple_choice") {
    h += `<fieldset class="options" style="border:0;padding:0;margin:8px 0"><legend class="sr-only">Варианты ответа</legend>
      ${(q.options || []).map((o) => `<label class="option"><input type="radio" name="mc" value="${esc(o.id)}" data-action="mc-choose" ${cur.mc === o.id ? "checked" : ""}><span>${mdInline(o.text)}</span></label>`).join("")}</fieldset>
      <div class="actions"><button class="btn primary" data-action="show-answer" data-primary data-reveal ${cur.mc ? "" : "disabled"}>Проверить <kbd>Enter</kbd></button>
      <button class="btn big" data-action="dont-know" data-dontknow>Не знаю <kbd>K</kbd></button></div>`;
    return h;
  }
  h += `<div class="answer-box"><label for="answer">Твой ответ — сформулируй своими словами, как на интервью</label>
    <textarea id="answer" data-draft="session" placeholder="Сначала попробуй вспомнить без подсказок…">${esc(cur.answer)}</textarea></div>`;
  for (let i = 0; i < cur.hints; i++) if (q.hints && q.hints[i]) h += `<div class="hint">Подсказка ${i + 1}: ${mdInline(q.hints[i])}</div>`;
  const simpler = App.selector.simplify(q.id, new Set(s.asked));
  h += `<div class="actions">
    <button class="btn primary" data-action="show-answer" data-primary data-reveal>Показать ответ <kbd>⌘↵</kbd></button>
    <button class="btn big" data-action="dont-know" data-dontknow>Не знаю <kbd>K</kbd></button>
    ${(q.hints || []).length > cur.hints ? `<button class="btn ghost" data-action="show-hint">Подсказка (${q.hints.length - cur.hints})</button>` : ""}
    ${simpler && s.kind !== "single" ? `<button class="btn ghost" data-action="simplify">Упростить вопрос</button>` : ""}
  </div>`;
  return h;
}

function renderRevealPhase(q, s) {
  const cur = s.cur;
  const checked = new Set(cur.checked);
  const c = App.repo.getConcept(q.conceptId);
  let h = `<div class="reveal" id="reveal" tabindex="-1">`;
  if (q.type === "multiple_choice") {
    h += `<section><div class="options">${(q.options || []).map((o) => {
      const cls = o.correct ? "correct" : cur.mc === o.id ? "wrong" : "";
      return `<div class="option ${cls}"><span aria-hidden="true">${o.correct ? "✓" : cur.mc === o.id ? "✗" : "·"}</span><span>${mdInline(o.text)}${o.correct ? ' <span class="sr-only">(правильный)</span>' : ""}<span class="expl">${mdInline(o.explanation || "")}</span></span></div>`;
    }).join("")}</div></section>`;
  } else {
    h += `<section><div class="section-title">Твой ответ</div><div class="your-answer">${cur.dontKnow ? "— (не знаю)" : esc(cur.answer || "— (пусто)")}</div></section>`;
  }
  h += `<section><div class="section-title">Ожидаемый ответ</div><div class="expected">${md(q.expected_answer)}</div></section>`;
  if ((q.key_points || []).length && q.type !== "multiple_choice") {
    h += `<section><div class="section-title">Ключевые пункты <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">— отметь, что прозвучало в твоём ответе</span></div>${renderKeyPoints(q, checked)}`;
    const missing = (q.key_points || []).filter((_, i) => !checked.has(i));
    if (cur.kpTouched && missing.length) h += `<div class="section-title" style="margin-top:10px">Что пропущено</div><ul class="missing">${missing.map((m) => `<li>${mdInline(m)}</li>`).join("")}</ul>`;
    h += `</section>`;
  }
  if ((q.common_mistakes || []).length) h += `<section><div class="section-title">Типичные ошибки</div>${strList(q.common_mistakes)}</section>`;
  if (cur.dontKnow) {
    h += `<section><div class="section-title">Объяснение</div>${md(c.summary)}${c.mechanism && (c.mechanism.steps || []).length ? `<ol class="steps">${c.mechanism.steps.slice(0, 4).map((st) => `<li><strong>${mdInline(st.title)}</strong>${md(st.description)}</li>`).join("")}</ol>` : ""}</section>`;
    if (c.minimal_example && c.minimal_example.code) h += `<section><div class="section-title">Пример</div>${renderExample(c.minimal_example)}</section>`;
  }
  if (q.follow_up) h += `<section><div class="section-title">Типичное уточнение интервьюера</div><div class="follow">${mdInline(q.follow_up)}</div></section>`;
  h += `<section><div class="section-title">Глубже</div><a href="#concept/${esc(c.id)}" data-action="goto-concept" data-id="${esc(c.id)}" data-section="mechanism">${esc(c.title)}: механизм и детали →</a></section>`;
  if (cur.dontKnow) {
    h += `<section><p class="small muted">«Не знаю» — нормальный результат. Вопрос вернётся в ближайшее повторение.</p>
      <div class="actions"><button class="btn primary" data-action="grade" data-score="0" data-primary data-next>Дальше <kbd>N</kbd></button></div></section>`;
  } else if (q.type === "multiple_choice") {
    const ok = (q.options || []).some((o) => o.correct && o.id === cur.mc);
    h += `<section><p><strong>${ok ? "✓ Верно" : "✗ Неверно"}</strong></p><div class="actions"><button class="btn primary" data-action="grade" data-score="${ok ? 3 : 0}" data-primary data-next>Дальше <kbd>N</kbd></button></div></section>`;
  } else {
    h += `<section><div class="section-title">Самооценка — насколько ты вспомнил сам</div>${renderGradeButtons("grade")}</section>`;
  }
  return h + `</div>`;
}

function viewSessionDone(s) {
  const res = s.results;
  const cnt = [0, 0, 0, 0];
  res.forEach((r) => cnt[r.score]++);
  const failed = res.filter((r) => r.score <= 1);
  let h = `<div class="page"><div class="card"><h1 tabindex="-1">${esc(s.title || "Сессия")}: итог</h1>`;
  if (!res.length) {
    h += `<p class="muted">Вопросов нет.</p>`;
  } else {
    h += `<div class="stats">
      <div class="stat"><div class="v">${res.length}</div><div class="l">пройдено</div></div>
      <div class="stat"><div class="v">${cnt[3]}</div><div class="l">уверенно</div></div>
      <div class="stat"><div class="v">${cnt[2]}</div><div class="l">вспомнил</div></div>
      <div class="stat"><div class="v">${cnt[1]}</div><div class="l">частично</div></div>
      <div class="stat"><div class="v">${cnt[0]}</div><div class="l">не вспомнил</div></div></div>`;
    if (failed.length) {
      h += `<div class="section-title">Над чем поработать</div><div class="list-links">${failed.map((r) => {
        const q = App.repo.getQuestion(r.qid);
        return `<a href="#question/${esc(r.qid)}">${levelBadge(q.level)}<span>${mdInline(q.question)}</span><span class="r">${esc(GRADE_RU[r.score])}</span></a>`;
      }).join("")}</div>`;
    }
  }
  h += `<div class="actions">
    ${failed.length ? `<button class="btn primary" data-action="repeat-mistakes" data-repeat data-primary>Повторить ошибки <kbd>R</kbd></button>` : ""}
    ${s.conceptId ? `<a class="btn" href="#concept/${esc(s.conceptId)}">К концепту</a>` : ""}
    <a class="btn ${failed.length ? "" : "primary"}" href="#home" ${failed.length ? "" : "data-primary"}>К прогрессу</a></div>`;
  return h + `</div></div>`;
}

/* ---------- Экраны режимов ---------- */

function viewRecall() {
  const s = App.ui.session;
  if (s && (s.kind === "recall" || s.kind === "smart")) return viewSession(s);
  const cid = App.ui.conceptId;
  const c = cid && App.repo.getConcept(cid);
  return `<div class="page"><h1 tabindex="-1">Recall — вспомни без подсказок</h1>
    <p class="muted">Ответ показывается только после твоей попытки. «Не знаю» — нормальный результат.</p>
    ${c ? `<div class="card"><div class="section-title">Текущий концепт</div><h2>${esc(c.title)}</h2>
      <p class="small muted">${App.repo.getQuestions(c.id).length} вопросов · адаптивно: уверенно → уровень выше, не вспомнил → ниже.</p>
      <div class="actions"><button class="btn primary" data-action="start-recall" data-id="${esc(c.id)}" data-primary>Начать recall по концепту</button></div></div>` : ""}
    <div class="card"><div class="section-title">Умная тренировка</div>
      <p class="small">15 вопросов по приоритету: просроченные → слабые концепции → новые → закрепление сильных.</p>
      <div class="actions"><button class="btn ${c ? "" : "primary"}" data-action="start-smart" ${c ? "" : "data-primary"}>Начать</button></div></div>
    <p class="small muted">Выбери концепт в навигации слева, чтобы тренировать конкретную тему.</p></div>`;
}

function viewQuestion(qid) {
  const s = App.ui.session;
  if (s && s.kind === "single" && (s.cur ? s.cur.qid === qid : s.asked.includes(qid))) return viewSession(s);
  if (!App.repo.getQuestion(qid)) return viewNotFound(`Вопрос «${qid}» не найден`);
  App.ui.session = newSession("single", { first: qid, title: "Вопрос", route: `#question/${qid}` });
  return viewSession(App.ui.session);
}

function viewReview() {
  const s = App.ui.session;
  if (s && s.kind === "review") return viewSession(s);
  const due = App.engine.getDueReviews();
  const pr = { critical: 0, important: 0, secondary: 0 };
  due.forEach((q) => pr[q.priority || "important"]++);
  const limit = Settings.get().daily_review_limit;
  if (!due.length) {
    return `<div class="page"><h1 tabindex="-1">Review</h1><div class="card"><p><strong>На сегодня повторять нечего.</strong></p>
      <p class="small muted">Вопросы попадают сюда после первой попытки recall — по интервалам 1 → 3 → 7 → 14 → 30 → 60 дней в зависимости от результата.</p>
      <div class="actions"><button class="btn primary" data-action="start-warmup" data-primary>Разогрев: новые вопросы L1–L2</button>
      <button class="btn" data-action="start-smart">Умная тренировка</button></div></div></div>`;
  }
  return `<div class="page"><h1 tabindex="-1">Review</h1><div class="card">
    <p style="font-size:1.1rem">Сегодня нужно повторить: <strong>${due.length}</strong></p>
    <div class="kv"><dt>Critical</dt><dd>${pr.critical}</dd><dt>Important</dt><dd>${pr.important}</dd><dt>Optional</dt><dd>${pr.secondary}</dd></div>
    <p class="small muted" style="margin-top:10px">Вопросы перемешаны по доменам (interleaving). Лимит за сессию: ${limit} (меняется в настройках).</p>
    <div class="actions"><button class="btn primary big" data-action="start-review" data-primary>Начать повторение (${Math.min(limit, due.length)})</button></div></div></div>`;
}

/* ---------- PRACTICE ---------- */

function practiceLink(p) {
  if (!p) return "";
  const rec = App.progress.data.practice[p.id];
  const c = App.repo.getConcept(p.conceptId);
  return `<a href="#practice/${esc(p.id)}"><span class="st ${rec ? "st-mastered" : "st-new"}" aria-label="${rec ? "решено" : "не решено"}">${rec ? "✓" : "○"}</span>
    <span>${esc(p.title)} ${p.origin === "extra" ? extraBadge() : ""}<br><span class="muted small">${esc(c.title)} · ${esc(p.type)}</span></span><span class="r">${stars(p.difficulty)}</span></a>`;
}

function viewPractice() {
  const tab = App.ui.practiceTab;
  const repo = App.repo;
  const seg = `<div class="seg" role="tablist" aria-label="Тип практики">
    ${[["tasks", `Задачи (${repo.practice.length})`], ["troubleshoot", `Troubleshoot (${repo.failures.length})`], ["worked", `Готовые решения (${repo.worked.length})`]].map(([k, t]) =>
      `<button role="tab" aria-pressed="${tab === k}" aria-selected="${tab === k}" data-action="practice-tab" data-tab="${k}">${t}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "tasks") {
    const inSet = new Set();
    for (const ps of repo.practiceSets) {
      const items = (ps.practice_ids || []).map((id) => repo.getPractice(id)).filter(Boolean);
      items.forEach((p) => inSet.add(p.id));
      body += `<div class="card"><h2>${esc(ps.title)}</h2>${ps.description ? `<p class="small muted">${mdInline(ps.description)}</p>` : ""}
        <div class="chips" style="margin-bottom:8px">${(ps.concept_ids || []).map((cid) => { const c = repo.getConcept(cid); return c ? `<a class="chip" href="#concept/${esc(cid)}">${stateIcon(App.engine.conceptState(cid))}${esc(c.title)}</a>` : ""; }).join("")}</div>
        <div class="list-links">${items.map(practiceLink).join("") || '<p class="muted small">Нет задач</p>'}</div>
        ${(ps.question_ids || []).length ? `<div class="actions"><button class="btn ghost" data-action="start-set-questions" data-id="${esc(ps.id)}">Вопросы набора (${ps.question_ids.length})</button></div>` : ""}</div>`;
    }
    const rest = repo.practice.filter((p) => !inSet.has(p.id));
    if (rest.length) body += `<div class="card"><h2>Другие задачи</h2><div class="list-links">${rest.map(practiceLink).join("")}</div></div>`;
  } else if (tab === "troubleshoot") {
    body += `<p class="small muted">Дан только симптом. Назови причину, механизм и исправление — потом сверь с разбором.</p>`;
    const groups = new Map();
    for (const f of repo.failures) {
      const d = repo.getConcept(f.conceptId).domain;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(f);
    }
    for (const [d, list] of groups) {
      body += `<div class="card"><div class="section-title">${esc(d)}</div><div class="list-links">${list.map((f) => {
        const rec = App.progress.data.troubleshoot[f.id];
        return `<a href="#troubleshoot/${esc(f.conceptId)}/${esc(f.id)}"><span class="st ${rec ? "st-mastered" : "st-new"}">${rec ? "✓" : "○"}</span><span>${mdInline(f.symptom || f.title)}<br><span class="muted small">${esc(repo.getConcept(f.conceptId).title)}</span></span></a>`;
      }).join("")}</div></div>`;
    }
  } else {
    body += `<p class="small muted">Сначала попробуй решить сам, потом открывай решение целиком или по шагам.</p>`;
    body += `<div class="card"><div class="list-links">${repo.worked.map((w) => `<a href="#worked/${esc(w.id)}"><span>${esc(w.title)} ${w.origin === "extra" ? extraBadge() : ""}<br><span class="muted small">${esc(repo.getConcept(w.conceptId).title)}</span></span></a>`).join("")}</div></div>`;
  }
  return `<div class="page"><h1 tabindex="-1">Practice</h1><p class="muted">Практика проверяет применение, а не определения.</p>${seg}<div style="margin-top:14px">${body}</div></div>`;
}

function viewPracticeTask(pid) {
  const p = App.repo.getPractice(pid);
  if (!p) return viewNotFound(`Задача «${pid}» не найдена`);
  const st = App.ui.practice[pid] || (App.ui.practice[pid] = { phase: "answer", draft: "", checked: [] });
  const c = App.repo.getConcept(p.conceptId);
  const rec = App.progress.data.practice[pid];
  let h = `<div class="page"><div class="crumbs"><a href="#practice">Practice</a> / <a href="#concept/${esc(c.id)}">${esc(c.title)}</a></div>
  <section class="card q-card"><div class="q-head"><span class="badge">${esc(p.type)}</span>${stars(p.difficulty)}${p.origin === "extra" ? extraBadge() : ""}${rec ? `<span class="badge">лучшая оценка: ${esc(GRADE_RU[rec.best] || "—")}</span>` : ""}</div>
  <h1 style="font-size:1.25rem" tabindex="-1">${esc(p.title)}</h1>${md(p.task)}
  ${(p.constraints || []).length ? `<div class="section-title" style="margin-top:10px">Ограничения</div>${strList(p.constraints)}` : ""}`;
  if (st.phase === "answer") {
    h += `<div class="answer-box"><label for="answer">Твой подход / решение</label><textarea id="answer" data-draft="practice:${esc(pid)}">${esc(st.draft)}</textarea></div>
    <div class="actions"><button class="btn primary" data-action="practice-show" data-id="${esc(pid)}" data-primary data-reveal>Показать эталон <kbd>⌘↵</kbd></button></div>`;
  } else {
    const checked = new Set(st.checked);
    h += `<div class="reveal"><section><div class="section-title">Твой подход</div><div class="your-answer">${esc(st.draft || "— (пусто)")}</div></section>
      <section><div class="section-title">Reference solution</div>${md(p.solution && p.solution.description)}${p.solution && p.solution.code ? codeBlock(p.solution.code, "") : ""}
      ${p.expected_output ? `<p class="small"><span class="muted">Ожидаемый результат:</span> ${mdInline(p.expected_output)}</p>` : ""}</section>`;
    if ((p.evaluation_points || []).length) {
      h += `<section><div class="section-title">Критерии — отметь, что учёл</div>${renderKeyPoints({ key_points: p.evaluation_points }, checked, "practice")}</section>`;
    }
    h += `<section><div class="section-title">Самооценка</div>${renderGradeButtons("practice-grade")}</section></div>`;
  }
  h += `</section>`;
  const set = App.repo.practiceSets.find((ps) => (ps.practice_ids || []).includes(pid));
  if (set) {
    const ids = set.practice_ids;
    const nxt = ids[(ids.indexOf(pid) + 1) % ids.length];
    if (nxt && nxt !== pid) h += `<div class="actions"><a class="btn ghost" href="#practice/${esc(nxt)}">Следующая задача набора «${esc(set.title)}» →</a></div>`;
  }
  return h + `</div>`;
}

function viewTroubleshoot(cid, fid) {
  const f = App.repo.getFailure(fid);
  if (!f) return viewNotFound(`Failure mode «${fid}» не найден`);
  const key = "ts:" + fid;
  const st = App.ui.practice[key] || (App.ui.practice[key] = { phase: "answer", cause: "", why: "", fix: "" });
  const c = App.repo.getConcept(f.conceptId);
  let h = `<div class="page"><div class="crumbs"><a href="#practice" data-action="practice-tab" data-tab="troubleshoot">Troubleshoot</a> / ${esc(c.domain)}</div>
  <section class="card q-card"><div class="q-head"><span class="badge">Troubleshoot</span>${f.origin === "extra" ? extraBadge() : ""}</div>
  <div class="section-title">Симптом</div><div class="q-text" tabindex="-1">${mdInline(f.symptom || f.title)}</div>`;
  if (st.phase === "answer") {
    h += `<div class="answer-box">
      <label for="ts-cause">Что является наиболее вероятной причиной?</label><textarea id="ts-cause" class="short" data-draft="ts:${esc(fid)}:cause">${esc(st.cause)}</textarea>
      <label for="ts-why">Почему это произошло (механизм)?</label><textarea id="ts-why" class="short" data-draft="ts:${esc(fid)}:why">${esc(st.why)}</textarea>
      <label for="ts-fix">Как исправить?</label><textarea id="ts-fix" class="short" data-draft="ts:${esc(fid)}:fix">${esc(st.fix)}</textarea></div>
      <div class="actions"><button class="btn primary" data-action="ts-show" data-id="${esc(fid)}" data-primary data-reveal>Показать разбор <kbd>⌘↵</kbd></button></div>`;
  } else {
    const row = (label, yours, ref) => `<section><div class="section-title">${label}</div><div class="two-col"><div><div class="small muted">Ты</div><div class="your-answer">${esc(yours || "—")}</div></div><div><div class="small muted">Разбор</div>${md(ref || "—")}</div></div></section>`;
    h += `<div class="reveal"><section><div class="section-title">Failure mode</div><strong>${mdInline(f.title)}</strong> · <a href="#concept/${esc(c.id)}">${esc(c.title)}</a></section>
      ${row("Причина", st.cause, f.cause)}${row("Механизм", st.why, f.mechanism)}${row("Исправление", st.fix, f.fix)}
      ${f.prevention ? `<section><div class="section-title">Профилактика</div>${md(f.prevention)}</section>` : ""}
      <section><div class="section-title">Самооценка</div>${renderGradeButtons("ts-grade")}</section></div>`;
  }
  h += `</section>`;
  const same = App.repo.failures.filter((x) => App.repo.domainOf(x.conceptId) === App.repo.domainOf(f.conceptId));
  const nxt = same[(same.findIndex((x) => x.id === fid) + 1) % same.length];
  if (nxt && nxt.id !== fid) h += `<div class="actions"><a class="btn ghost" href="#troubleshoot/${esc(nxt.conceptId)}/${esc(nxt.id)}">Следующий симптом →</a></div>`;
  void cid;
  return h + `</div>`;
}

function viewWorked(wid) {
  const w = App.repo.getWorked(wid);
  if (!w) return viewNotFound(`Решение «${wid}» не найдено`);
  const c = App.repo.getConcept(w.conceptId);
  return `<div class="page"><div class="crumbs"><a href="#practice">Practice</a> / <a href="#concept/${esc(c.id)}">${esc(c.title)}</a></div>${renderWorkedInteractive(w)}</div>`;
}

/* ---------- EXAM ---------- */

function viewExam() {
  const s = App.ui.session;
  if (s && s.kind === "exam") {
    if (s.phase === "answering") return viewExamAnswering(s);
    if (s.phase === "grading") return viewExamGrading(s);
    return viewExamResult(s);
  }
  const cfg = App.ui.examCfg;
  const domains = App.repo.domainTree().map((d) => d.name);
  const sets = App.repo.examSets;
  return `<div class="page"><h1 tabindex="-1">Exam</h1>
  <p class="muted">Смешанные вопросы без подсказок, mental model и эталонов. Проверка — после последнего ответа.</p>
  ${sets.length ? `<div class="card"><div class="section-title">Готовые экзамены</div><div class="list-links">${sets.map((x) => `<a href="#exam" data-action="exam-set" data-id="${esc(x.id)}"><span>${esc(x.title)}${x.description ? `<br><span class="muted small">${mdInline(x.description)}</span>` : ""}</span><span class="r">${x.question_ids.length} вопр.</span></a>`).join("")}</div></div>` : ""}
  <div class="card"><div class="section-title">Случайный экзамен с балансом уровней</div>
    <div class="field"><span>Количество вопросов</span><div class="seg">${[10, 20, 30].map((n) => `<button data-action="exam-size" data-n="${n}" aria-pressed="${cfg.size === n}">${n}</button>`).join("")}</div></div>
    <div class="field"><span>Домены (пусто — все)</span><div class="chips">${domains.map((d) => `<button class="chip ${cfg.domains.includes(d) ? "on" : ""}" data-action="exam-domain" data-d="${esc(d)}" aria-pressed="${cfg.domains.includes(d)}">${esc(d)}</button>`).join("")}</div></div>
    ${App.repo.questions.some((q) => q.key_question) ? `<label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-action="exam-keyq" ${cfg.keyqOnly ? "checked" : ""}> Только ключевые вопросы</label>` : ""}
    <p class="small muted">Пропорция уровней на 20 вопросов: L1 4 · L2 5 · L3 5 · L4 3 · L5 2 · L6 1.</p>
    <div class="actions"><button class="btn primary big" data-action="start-exam" data-primary>Начать экзамен</button></div></div></div>`;
}

function startExam(setId = null) {
  const cfg = App.ui.examCfg;
  const queue = App.selector.examQueue({ setId, size: cfg.size, domains: cfg.domains, keyqOnly: cfg.keyqOnly });
  if (!queue.length) { toast("Нет вопросов под выбранные фильтры"); return; }
  const set = setId && App.repo.examSets.find((x) => x.id === setId);
  App.ui.session = { kind: "exam", title: set ? set.title : "Экзамен", setId, queue, index: 0, answers: {}, dontKnow: [], phase: "answering", gradeIndex: 0, grades: {}, checked: {}, touched: {}, started: Date.now(), route: "#exam" };
  go("#exam");
}

function viewExamAnswering(s) {
  const qid = s.queue[s.index];
  const q = App.repo.getQuestion(qid);
  const last = s.index === s.queue.length - 1;
  const dk = s.dontKnow.includes(qid);
  return `<div class="page"><div class="session-bar"><strong>${esc(s.title)}</strong>
    <div class="progressbar"><div style="width:${(s.index / s.queue.length) * 100}%"></div></div><span>${s.index + 1} / ${s.queue.length}</span>
    <button class="btn ghost" data-action="end-session">Прервать</button></div>
  <section class="card q-card">${questionMeta(q, App.repo, { exam: true })}${renderQuestionBody(q)}
    ${q.type === "multiple_choice"
      ? `<fieldset class="options" style="border:0;padding:0"><legend class="sr-only">Варианты</legend>${q.options.map((o) => `<label class="option"><input type="radio" name="mc" value="${esc(o.id)}" data-action="exam-mc" ${s.answers[qid] === o.id ? "checked" : ""}><span>${mdInline(o.text)}</span></label>`).join("")}</fieldset>`
      : `<div class="answer-box"><label for="answer">Ответ</label><textarea id="answer" data-draft="exam:${esc(qid)}" ${dk ? "disabled" : ""}>${esc(dk ? "" : s.answers[qid] || "")}</textarea></div>`}
    <div class="actions">
      ${s.index > 0 ? `<button class="btn ghost" data-action="exam-prev">← Назад</button>` : ""}
      <button class="btn primary" data-action="${last ? "exam-finish" : "exam-next"}" data-primary data-next>${last ? "Завершить и проверить" : "Дальше"} <kbd>⌘↵</kbd></button>
      <button class="btn" data-action="exam-dontknow" data-dontknow aria-pressed="${dk}">${dk ? "✓ Не знаю" : "Не знаю"} <kbd>K</kbd></button>
      ${!last ? `<button class="btn ghost" data-action="exam-finish">Завершить досрочно</button>` : ""}
    </div></section></div>`;
}

function viewExamGrading(s) {
  const qid = s.queue[s.gradeIndex];
  const q = App.repo.getQuestion(qid);
  const dk = s.dontKnow.includes(qid);
  const checked = new Set(s.checked[qid] || []);
  let body;
  if (q.type === "multiple_choice") {
    const ok = q.options.some((o) => o.correct && o.id === s.answers[qid]);
    body = `<section><div class="options">${q.options.map((o) => `<div class="option ${o.correct ? "correct" : s.answers[qid] === o.id ? "wrong" : ""}"><span>${o.correct ? "✓" : s.answers[qid] === o.id ? "✗" : "·"}</span><span>${mdInline(o.text)}<span class="expl">${mdInline(o.explanation || "")}</span></span></div>`).join("")}</div></section>
      <section><p><strong>${ok ? "✓ Верно" : "✗ Неверно"}</strong></p><div class="actions"><button class="btn primary" data-action="exam-grade" data-score="${ok ? 3 : 0}" data-primary>Дальше</button></div></section>`;
  } else {
    body = `<section><div class="section-title">Твой ответ</div><div class="your-answer">${dk ? "— (не знаю)" : esc(s.answers[qid] || "— (пусто)")}</div></section>
      <section><div class="section-title">Ожидаемый ответ</div>${md(q.expected_answer)}</section>
      ${(q.key_points || []).length ? `<section><div class="section-title">Ключевые пункты — отметь, что было в ответе</div>${renderKeyPoints(q, checked, "exam")}</section>` : ""}
      <section>${dk ? `<div class="actions"><button class="btn primary" data-action="exam-grade" data-score="0" data-primary>Дальше</button></div>` : `<div class="section-title">Самооценка</div>${renderGradeButtons("exam-grade")}`}</section>`;
  }
  return `<div class="page"><div class="session-bar"><strong>Проверка: ${esc(s.title)}</strong>
    <div class="progressbar"><div style="width:${(s.gradeIndex / s.queue.length) * 100}%"></div></div><span>${s.gradeIndex + 1} / ${s.queue.length}</span></div>
    <section class="card q-card">${questionMeta(q, App.repo)}${renderQuestionBody(q)}<div class="reveal">${body}</div></section></div>`;
}

function examByLevel(s) {
  const by = {};
  for (const qid of s.queue) {
    const q = App.repo.getQuestion(qid);
    if (!q || s.grades[qid] == null) continue;
    by[q.level] = by[q.level] || { n: 0, sum: 0 };
    by[q.level].n++;
    by[q.level].sum += s.grades[qid];
  }
  return by;
}

function renderExamLevels(by) {
  return LEVELS.filter((l) => by[l]).map((l) => {
    const v = by[l].sum / (3 * by[l].n);
    return `<div class="exam-level"><span>${esc(LEVEL_TITLES[l])}</span><div class="bar"><span class="b-acc" style="width:${pct(v)}%"></span></div><span class="n">${pct(v)}% · ${by[l].n}</span></div>`;
  }).join("");
}

function viewExamResult(s) {
  const by = examByLevel(s);
  const mistakes = s.queue.filter((qid) => s.grades[qid] != null && s.grades[qid] <= 1);
  return `<div class="page"><div class="card"><h1 tabindex="-1">${esc(s.title)}: результат</h1>
    <p class="muted small">Оценка по уровням — не один общий score.</p>${renderExamLevels(by)}</div>
    ${mistakes.length ? `<div class="card"><h2>Review mistakes · ${mistakes.length}</h2>${mistakes.map((qid) => {
      const q = App.repo.getQuestion(qid);
      const c = App.repo.getConcept(q.conceptId);
      const missing = (q.key_points || []).filter((_, i) => !(s.checked[qid] || []).includes(i));
      return `<div class="mistake"><div class="q">${mdInline(q.question)}</div>
        <div class="small muted">Твой ответ</div><div class="your-answer">${s.dontKnow.includes(qid) ? "— (не знаю)" : esc(s.answers[qid] || "—")}</div>
        <details><summary class="small" style="cursor:pointer">Ожидаемый ответ и пропущенное</summary>${md(q.expected_answer)}${missing.length ? `<div class="small muted">Пропущено:</div><ul class="missing">${missing.map((m) => `<li>${mdInline(m)}</li>`).join("")}</ul>` : ""}</details>
        <div class="actions"><a class="btn" href="#question/${esc(qid)}">Retry — новая попытка</a><a class="btn ghost" href="#concept/${esc(c.id)}">${esc(c.title)}</a></div></div>`;
    }).join("")}</div>` : `<div class="card"><p>Ошибок нет — отлично.</p></div>`}
    <div class="actions"><button class="btn primary" data-action="exam-new" data-primary>Новый экзамен</button><a class="btn" href="#home">К прогрессу</a></div></div>`;
}

/* ---------- КЛЮЧЕВЫЕ ВОПРОСЫ (key_question) ---------- */

function keyqMark(qid) {
  const r = App.progress.getQuestion(qid);
  if (!r) return `<span class="st st-new" aria-label="не пройден">○</span>`;
  if (r.last_score <= 1) return `<span class="st" style="color:var(--bad)" aria-label="не вспомнил">✗</span>`;
  return `<span class="st st-mastered" aria-label="вспомнил">${r.last_score === 3 ? "✓✓" : "✓"}</span>`;
}

function keyqQuestions(domain = "", weakOnly = false) {
  return App.repo.questions.filter((q) => {
    if (!q.key_question) return false;
    if (domain && App.repo.domainOf(q.conceptId) !== domain) return false;
    if (weakOnly) { const r = App.progress.getQuestion(q.id); return !r || r.last_score <= 1; }
    return true;
  });
}

function viewKeyQuestions() {
  const repo = App.repo;
  const all = keyqQuestions();
  if (!all.length) return viewNotFound("В курсе нет вопросов с пометкой key_question");
  const done = all.filter((q) => { const r = App.progress.getQuestion(q.id); return r && r.last_score >= 2; }).length;
  const weak = keyqQuestions("", true).length;
  let h = `<div class="page wide"><h1 tabindex="-1">Ключевые вопросы</h1>
    <p class="muted">Вопросы, которые будут задавать, в порядке тем. Каждый — отдельная попытка вспомнить: ответ, сверка с эталоном, самооценка.</p>
    <div class="actions" style="margin-bottom:18px">
      <span class="badge keyq">вспомнил ${done} из ${all.length}</span>
      ${weak ? `<button class="btn primary" data-action="start-keyq" data-weak="1" data-primary>Прогнать невспомненные (${weak})</button>` : ""}
      <button class="btn" data-action="start-keyq">Прогнать все ключевые вопросы (${all.length})</button>
    </div>`;
  for (const d of repo.domainTree()) {
    const qs = keyqQuestions(d.name);
    if (!qs.length) continue;
    const dd = qs.filter((q) => { const r = App.progress.getQuestion(q.id); return r && r.last_score >= 2; }).length;
    h += `<section class="card"><h2 style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">${esc(d.name)} <span class="muted small">${dd}/${qs.length}</span>
      <button class="btn ghost" style="margin-left:auto" data-action="start-keyq" data-d="${esc(d.name)}">Прогнать раздел</button></h2>`;
    let lastConcept = null;
    h += `<div class="list-links">`;
    for (const q of qs) {
      if (q.conceptId !== lastConcept) {
        const c = repo.getConcept(q.conceptId);
        h += `<div class="section-title" style="margin:12px 0 2px">${esc(App.repo.domainPath(c).slice(1).join(" / ") || "")}${App.repo.domainPath(c).length > 1 ? " · " : ""}<a href="#concept/${esc(c.id)}" style="text-transform:none;letter-spacing:0">${esc(c.title)}</a></div>`;
        lastConcept = q.conceptId;
      }
      h += `<a href="#question/${esc(q.id)}">${keyqMark(q.id)}<span>${mdInline(q.question)}</span><span class="r">${esc(q.level)}</span></a>`;
    }
    h += `</div></section>`;
  }
  return h + `</div>`;
}

/* ---------- MAP ---------- */

function viewMap() {
  const repo = App.repo;
  const groups = new Map();
  for (const c of repo.concepts) {
    if (!groups.has(c.domain)) groups.set(c.domain, []);
    groups.get(c.domain).push(c);
  }
  let h = `<div class="page wide"><h1 tabindex="-1">Карта знаний</h1>
  <div class="legend" style="margin-bottom:14px"><span>${stateIcon("new")} New</span><span>${stateIcon("learning")} Learning</span><span>${stateIcon("review")} Review</span><span>${stateIcon("mastered")} Mastered</span><span class="muted">стрелка A → B: сначала A, потом B</span></div>`;
  for (const [domain, list] of groups) {
    const ids = new Set(list.map((c) => c.id));
    const nodes = list.map((c) => {
      const st = App.engine.conceptState(c.id);
      return { id: c.id, label: `${STATE_ICON[st]} ${c.title}`, cls: `st-${st}${App.ui.conceptId === c.id ? " current" : ""}`, href: `#concept/${c.id}`, aria: `${c.title} — ${STATE_RU[st]}` };
    });
    const edges = [];
    const external = [];
    for (const c of list) {
      for (const p of c.prerequisites || []) {
        if (ids.has(p)) edges.push({ from: p, to: c.id });
        else if (repo.getConcept(p)) external.push({ p, c });
      }
    }
    const other = repo.relations.filter((r) => r.type !== "requires" && r.type !== "prerequisite" && (ids.has(r.from) || ids.has(r.to)));
    h += `<section class="card map-domain"><h2>${esc(domain)} <span class="muted small">${list.length}</span></h2>
      ${layeredGraphSvg(nodes, edges, { aria: `Карта: ${domain}`, maxChars: 22, gapY: 36 })}
      ${external.length ? `<div class="map-rel"><span class="muted">Нужно из других тем:</span>${external.map(({ p, c }) => `<span><a href="#concept/${esc(p)}">${esc(repo.getConcept(p).title)}</a> → ${esc(c.title)}</span>`).join("")}</div>` : ""}
      ${other.length ? `<div class="map-rel">${other.slice(0, 14).map((r) => `<span><a href="#concept/${esc(r.from)}">${esc(repo.getConcept(r.from).title)}</a> <span class="muted">${esc(RELATION_RU[r.type] || r.type)}</span> <a href="#concept/${esc(r.to)}">${esc(repo.getConcept(r.to).title)}</a></span>`).join("")}</div>` : ""}
    </section>`;
  }
  return h + `</div>`;
}

/* ---------- SETTINGS ---------- */

function viewSettings() {
  const s = Settings.get();
  const v = App.validation || { errors: [], warnings: [] };
  const course = App.repo.course;
  return `<div class="page"><h1 tabindex="-1">Настройки и данные</h1>
  <div class="card"><h2>Интерфейс</h2>
    <div class="field"><span>Тема</span><div class="seg">${[["system", "Системная"], ["light", "Светлая"], ["dark", "Тёмная"]].map(([k, t]) => `<button data-action="set-theme" data-theme="${k}" aria-pressed="${s.theme === k}">${t}</button>`).join("")}</div></div>
    <label class="field"><span>Лимит вопросов в Review за сессию</span><input type="number" min="5" max="200" value="${s.daily_review_limit}" data-action="set-limit"></label>
    <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-action="set-dev" ${s.dev ? "checked" : ""}> Режим разработчика (результаты validateCourse)</label>
    <p class="small muted">Клавиши: 1–5 режимы (Learn, Recall, Practice, Review, Exam), 6 — карта, 7 — ключевые вопросы, / — поиск, Space — показать ответ, ⌘/Ctrl+Enter — отправить, N — дальше, K — «Не знаю», R — повторить ошибки.</p>
  </div>
  <div class="card"><h2>Прогресс</h2><p class="small muted">Хранится только в этом браузере (localStorage: learning_progress, learning_history, learning_settings). Ответы пользователя не сохраняются.</p>
    <div class="actions"><button class="btn" data-action="export-progress">Export progress</button>
      <label class="btn">Import progress<input type="file" accept="application/json,.json" data-action="import-progress" class="sr-only"></label>
      <button class="btn danger" data-action="reset-progress">Reset progress</button></div></div>
  <div class="card"><h2>Курс</h2>
    <p class="small">${esc(App.repo.meta.title || "")} · schema ${esc(course.schema_version)} · ${App.repo.concepts.length} концептов · ${App.repo.questions.length} вопросов · ${App.repo.practice.length} задач<br>
    <span class="muted">Источник: ${App.source === "custom" ? "загружен пользователем (localStorage: learning_course)" : App.source === "fetch" ? "course.json рядом с index.html" : "встроен в index.html"}</span></p>
    <div class="actions"><button class="btn" data-action="export-course">Export course</button>
      <label class="btn">Import course.json<input type="file" accept="application/json,.json" data-action="import-course" class="sr-only"></label>
      ${App.source === "custom" ? `<button class="btn danger" data-action="reset-course">Вернуть встроенный курс</button>` : ""}</div></div>
  <div class="card"><h2>Проверка курса</h2><p class="small">validateCourse: <strong>${v.errors.length}</strong> ошибок, ${v.warnings.length} предупреждений.</p>
    ${s.dev || v.errors.length ? `<ul class="validation">${v.errors.map((e) => `<li>✗ ${esc(e.where)}: ${esc(e.problem)}</li>`).join("")}${v.warnings.map((e) => `<li>⚠ ${esc(e.where)}: ${esc(e.problem)}</li>`).join("")}</ul>` : `<p class="small muted">Подробности — в режиме разработчика.</p>`}</div>
  </div>`;
}

function viewNotFound(msg) {
  return `<div class="page"><div class="card"><h1 tabindex="-1">Не найдено</h1><p>${esc(msg)}</p><a class="btn" href="#home">На главную</a></div></div>`;
}

function viewFatal(result, canContinue) {
  const errs = result.errors.slice(0, 40);
  return `<div class="fatal"><div class="card"><h1>Ошибка загрузки курса</h1>
    ${errs.map((e) => `<div class="mistake"><div><span class="muted small">Проблема:</span> ${esc(e.problem)}</div><div><span class="muted small">Где:</span> <code>${esc(e.where)}</code></div></div>`).join("")}
    ${result.errors.length > errs.length ? `<p class="small muted">…и ещё ${result.errors.length - errs.length}</p>` : ""}
    <p><span class="muted small">Что можно сделать:</span> проверить JSON (<code>python3 tools/build.py</code>) или вернуть встроенный курс.</p>
    <div class="actions">${canContinue ? `<button class="btn primary" data-action="fatal-continue">Продолжить всё равно</button>` : ""}
      <button class="btn" data-action="reset-course">Вернуть встроенный курс</button></div></div></div>`;
}
