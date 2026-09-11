/* ===================================================================
 * UI SHELL: роутер, сайдбар, обработчики событий, клавиатура, загрузка.
 * =================================================================== */

const MODES = [
  { key: "learn", label: "Learn", route: "#learn", code: "Digit1" },
  { key: "recall", label: "Recall", route: "#recall", code: "Digit2" },
  { key: "practice", label: "Practice", route: "#practice", code: "Digit3" },
  { key: "review", label: "Review", route: "#review", code: "Digit4" },
  { key: "exam", label: "Exam", route: "#exam", code: "Digit5" },
  { key: "map", label: "Map", route: "#map", code: "Digit6" },
  { key: "keyq", label: "Ключевые", route: "#keyq", code: "Digit7", optional: true },
];
const DRAFTS_KEY = "learning_drafts";
const $ = (sel, root = document) => root.querySelector(sel);

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function toast(msg) {
  const old = $(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function announce(msg) {
  const live = $("#live");
  if (live) { live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 30); }
}

function persistUi() {
  try {
    sessionStorage.setItem("learning_ui", JSON.stringify({
      session: App.ui.session, revealed: App.ui.revealed, story: App.ui.story, visualStep: App.ui.visualStep, conceptId: App.ui.conceptId,
      practiceTab: App.ui.practiceTab, examCfg: App.ui.examCfg, filters: App.ui.filters,
    }));
  } catch (e) { /* sessionStorage недоступен — контекст живёт до перезагрузки */ }
}

function restoreUi() {
  try {
    const d = JSON.parse(sessionStorage.getItem("learning_ui") || "null");
    if (!d) return;
    if (d.session && (d.session.done || (d.session.cur && App.repo.getQuestion(d.session.cur.qid)) || (d.session.kind === "exam" && d.session.queue.every((q) => App.repo.getQuestion(q))))) App.ui.session = d.session;
    if (d.revealed) App.ui.revealed = d.revealed;
    if (d.story) App.ui.story = d.story;
    if (d.visualStep) App.ui.visualStep = d.visualStep;
    if (d.conceptId && App.repo.getConcept(d.conceptId)) App.ui.conceptId = d.conceptId;
    if (d.practiceTab) App.ui.practiceTab = d.practiceTab;
    if (d.examCfg) App.ui.examCfg = Object.assign(App.ui.examCfg, d.examCfg);
    if (d.filters) App.ui.filters = Object.assign(App.ui.filters, d.filters);
  } catch (e) { /* ignore */ }
}

function loadDrafts() { return Store.get(DRAFTS_KEY, {}); }
function saveDraft(key, value) {
  const d = loadDrafts();
  if (value) d[key] = value; else delete d[key];
  Store.set(DRAFTS_KEY, d);
}

/* ---------- Роутер ---------- */

function parseRoute() {
  const raw = decodeURIComponent((location.hash || "#home").slice(1));
  const [route, ...params] = raw.split("/");
  return { route: route || "home", params };
}

function render() {
  const openModal = document.querySelector(".viz-modal");
  if (openModal) { openModal.remove(); document.body.classList.remove("modal-open"); }
  const { route, params } = parseRoute();
  App.ui.route = route;
  App.ui.params = params;
  let html;
  switch (route) {
    case "home": html = viewHome(); break;
    case "learn": {
      const cid = App.ui.conceptId || (App.engine.nextToLearn(1)[0] || App.repo.concepts[0]).id;
      history.replaceState(null, "", `#concept/${cid}`);
      html = viewConcept(cid);
      break;
    }
    case "concept": html = viewConcept(params[0]); break;
    case "recall": html = viewRecall(); break;
    case "question": html = viewQuestion(params[0]); break;
    case "review": html = viewReview(); break;
    case "practice": html = params[0] ? viewPracticeTask(params[0]) : viewPractice(); break;
    case "troubleshoot": html = viewTroubleshoot(params[0], params[1]); break;
    case "worked": html = viewWorked(params[0]); break;
    case "exam": html = viewExam(); break;
    case "map": html = viewMap(); break;
    case "keyq": html = viewKeyQuestions(); break;
    case "settings": html = viewSettings(); break;
    default: html = viewNotFound(`Раздел «${route}» не найден`);
  }
  const main = $("#main");
  const sameRoute = main.dataset.hash === location.hash;
  const scroll = main.scrollTop;
  main.innerHTML = html + returnPill();
  main.dataset.hash = location.hash;
  if (sameRoute) main.scrollTop = scroll; else main.scrollTop = 0;
  renderTabs();
  renderSidebar();
  persistUi();
  afterRender(sameRoute);
}

function linkTerms() {
  hideTermPop();
  const main = $("#main");
  const r = App.ui.route;
  const cur = r === "concept" ? App.ui.params[0] : null;
  let domainCid = cur;
  if (r === "worked") { const w = App.repo.getWorked(App.ui.params[0]); domainCid = w && w.conceptId; }
  else if (r === "practice" && App.ui.params[0]) { const p = App.repo.getPractice(App.ui.params[0]); domainCid = p && p.conceptId; }
  else if (r === "troubleshoot") domainCid = App.ui.params[0];
  else if (!cur && App.ui.session && App.ui.session.cur) { const q = App.repo.getQuestion(App.ui.session.cur.qid); domainCid = q && q.conceptId; }
  const domain = domainCid ? App.repo.domainOf(domainCid) : null;
  if (r === "concept" || r === "worked") Glossary.link(main, cur, domain);
  else main.querySelectorAll(".reveal").forEach((el) => Glossary.link(el, null, domain));
}

let termHideTimer = null;
function termPop() {
  let pop = $("#term-pop");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "term-pop";
    pop.className = "term-pop";
    pop.setAttribute("role", "tooltip");
    pop.hidden = true;
    pop.addEventListener("mouseenter", () => clearTimeout(termHideTimer));
    pop.addEventListener("mouseleave", () => scheduleHideTermPop());
    pop.addEventListener("click", (e) => { if (e.target.closest("a")) hideTermPop(); });
    document.body.appendChild(pop);
  }
  return pop;
}
function showTermPop(el) {
  clearTimeout(termHideTimer);
  const pop = termPop();
  const cur = App.ui.route === "concept" ? App.ui.params[0] : null;
  pop.innerHTML = Glossary.popHtml(Number(el.dataset.g), cur, App.repo);
  pop.hidden = false;
  pop.dataset.for = el.dataset.g;
  const r = el.getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 24);
  pop.style.maxWidth = w + "px";
  const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
  pop.style.left = left + "px";
  const below = r.bottom + 8;
  pop.style.top = below + "px";
  const h = pop.offsetHeight;
  if (below + h > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - h - 8) + "px";
  el.setAttribute("aria-describedby", "term-pop");
}
function hideTermPop() {
  clearTimeout(termHideTimer);
  const pop = $("#term-pop");
  if (pop) pop.hidden = true;
}
function scheduleHideTermPop() {
  clearTimeout(termHideTimer);
  termHideTimer = setTimeout(hideTermPop, 250);
}

/* ---------- Размер схемы: помещается → как есть; чуть шире → ужать до 72%; сильно шире → 72% + прокрутка.
 * В развёрнутом режиме (оверлей) — натуральный размер. ---------- */
const MIN_SCALE = 0.72;
function fitVisual(canvas) {
  const el = canvas.querySelector("svg");
  const fig = canvas.closest(".visual");
  if (!el || !fig) return;
  const attr = el.getAttribute("width") || "";
  const vb = el.viewBox && el.viewBox.baseVal ? el.viewBox.baseVal.width : 0;
  const natural = attr && !attr.endsWith("%") ? parseFloat(attr) : vb;
  el.style.width = "";
  el.style.maxWidth = "";
  const expanded = fig.classList.contains("expanded");
  const floor = expanded ? 0.55 : MIN_SCALE;
  const avail = canvas.clientWidth;
  if (!natural || !avail) return;
  const overflowing = natural > avail + 2;
  fig.classList.toggle("overflowing", overflowing);
  if (!overflowing) { el.style.width = natural + "px"; el.style.maxWidth = "100%"; fig.classList.remove("wide"); return; }
  const scale = avail / natural;
  if (scale >= floor) { el.style.width = "100%"; el.style.maxWidth = "100%"; fig.classList.remove("wide"); }
  else { el.style.width = Math.round(natural * floor) + "px"; el.style.maxWidth = "none"; fig.classList.add("wide"); }
}

function openVisualModal(fig) {
  closeVisualModal();
  const modal = document.createElement("div");
  modal.className = "viz-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `<div class="viz-backdrop" data-action="visual-close"></div><div class="viz-box"></div>`;
  const holder = document.createComment("visual-placeholder");
  fig.parentNode.insertBefore(holder, fig);
  modal._holder = holder;
  modal.querySelector(".viz-box").appendChild(fig);
  fig.classList.add("expanded");
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  const c = fig.querySelector(".v-canvas");
  if (c) fitVisual(c);
  const btn = fig.querySelector(".v-close");
  if (btn) btn.focus({ preventScroll: true });
}

function closeVisualModal() {
  const modal = document.querySelector(".viz-modal");
  if (!modal) return false;
  const fig = modal.querySelector("figure.visual");
  if (fig && modal._holder && modal._holder.parentNode) {
    fig.classList.remove("expanded");
    modal._holder.parentNode.replaceChild(fig, modal._holder);
    const c = fig.querySelector(".v-canvas");
    if (c) fitVisual(c);
    const b = fig.querySelector(".v-expand");
    if (b) b.focus({ preventScroll: true });
  }
  modal.remove();
  document.body.classList.remove("modal-open");
  return true;
}

/* ---------- Mermaid: ленивый рендер схем с кэшем по теме и исходнику ---------- */
const MermaidRender = {
  theme: null,
  cache: new Map(),
  seq: 0,
  isDark() {
    const t = document.documentElement.dataset.theme;
    if (t) return t === "dark";
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  },
  ensureInit() {
    if (typeof mermaid === "undefined") return false;
    const theme = this.isDark() ? "dark" : "light";
    if (this.theme === theme) return true;
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "Nunito, system-ui, sans-serif",
      sequence: { mirrorActors: false, messageFontSize: 14, actorFontSize: 14, noteFontSize: 13, useMaxWidth: false, actorMargin: 40, boxMargin: 8 },
      flowchart: { useMaxWidth: true, curve: "basis" },
      themeVariables: {
        fontFamily: "Nunito, system-ui, sans-serif",
        fontSize: "15px",
        background: v("--surface"),
        primaryColor: v("--mm-node"),
        primaryBorderColor: v("--mm-border"),
        primaryTextColor: v("--text"),
        secondaryColor: v("--mm-node-2"),
        tertiaryColor: v("--surface-2"),
        lineColor: v("--mm-line"),
        textColor: v("--text"),
        actorBkg: v("--mm-node"),
        actorBorder: v("--mm-border"),
        actorTextColor: v("--text"),
        signalColor: v("--mm-line"),
        signalTextColor: v("--text"),
        noteBkgColor: v("--mm-note"),
        noteBorderColor: v("--mm-note-border"),
        noteTextColor: v("--text"),
        labelBoxBkgColor: v("--mm-node"),
        labelTextColor: v("--text"),
        loopTextColor: v("--text"),
        edgeLabelBackground: v("--surface"),
        clusterBkg: v("--surface-2"),
        clusterBorder: v("--mm-border"),
      },
    });
    this.theme = theme;
    this.cache.clear();
    return true;
  },
  async renderIn(root) {
    const canvases = (root || document).querySelectorAll(".v-canvas[data-vid]");
    if (!canvases.length) return;
    if (!this.ensureInit()) {
      canvases.forEach((c) => { c.innerHTML = `<div class="v-error">Библиотека схем не загружена.</div>`; });
      return;
    }
    for (const canvas of canvases) {
      const src = Visuals.sources.get(canvas.dataset.vid);
      if (!src) continue;
      const key = this.theme + "\u0000" + src;
      let svg = this.cache.get(key);
      if (!svg) {
        try {
          const out = await mermaid.render("mmd" + ++this.seq, src);
          svg = out.svg;
          this.cache.set(key, svg);
        } catch (e) {
          canvas.innerHTML = `<div class="v-error">Ошибка в схеме: ${esc(String(e && e.message || e).slice(0, 300))}</div>`;
          document.querySelectorAll('[id^="dmmd"]').forEach((el) => el.remove());
          continue;
        }
      }
      if (!canvas.isConnected) continue;
      canvas.innerHTML = svg;
      fitVisual(canvas);
    }
  },
};

function afterRender(sameRoute) {
  MermaidRender.renderIn($("#main"));
  linkTerms();
  const s = App.ui.session;
  const target = App.ui.scrollTo;
  const block = App.ui.scrollBlock || "start";
  App.ui.scrollTo = null;
  App.ui.scrollBlock = null;
  if (target) {
    const el = document.getElementById(target);
    if (el) { el.scrollIntoView({ block, behavior: "smooth" }); return; }
  }
  if (sameRoute) return;
  const fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  const ta = $("#main textarea:not([disabled])");
  if (s && !s.done && ta && fine) { ta.focus(); return; }
  const h1 = $("#main h1[tabindex]");
  if (h1) h1.focus({ preventScroll: true });
}

function activeMode() {
  const r = App.ui.route;
  if (r === "concept" || r === "learn" || r === "worked") return "learn";
  if (r === "question") return "recall";
  if (r === "troubleshoot") return "practice";
  if (r === "review" && App.ui.session && App.ui.session.title && App.ui.session.title.startsWith("Ключевые")) return "keyq";
  return r;
}

function renderTabs() {
  const mode = activeMode();
  const hasKeyQuestions = App.repo.questions.some((q) => q.key_question);
  $("#tabs").innerHTML = MODES.filter((m) => !m.optional || hasKeyQuestions)
    .map((m, i) => `<a class="tab" href="${m.route}" ${mode === m.key ? 'aria-current="page"' : ""}>${m.label}<kbd>${i + 1}</kbd></a>`).join("");
}

function returnPill() {
  const s = App.ui.session;
  if (!s || s.done) return "";
  const onSession = (s.kind === "exam" && App.ui.route === "exam") ||
    ((s.kind === "recall" || s.kind === "smart") && App.ui.route === "recall") ||
    (s.kind === "review" && App.ui.route === "review") ||
    (s.kind === "single" && App.ui.route === "question");
  if (onSession) return "";
  return `<a class="btn primary return-pill" href="${esc(s.route)}">← Вернуться к вопросу</a>`;
}

/* ---------- Сайдбар ---------- */

function conceptPasses(c) {
  const f = App.ui.filters;
  const e = App.engine;
  if (f.domain && App.repo.domainPath(c)[0] !== f.domain) return false;
  if (f.level && c.level !== f.level) return false;
  if (f.difficulty && String(App.repo.conceptDifficulty(c.id)) !== f.difficulty) return false;
  if (f.status && e.conceptState(c.id) !== f.status) return false;
  if (f.due && !e.conceptStats(c.id).due) return false;
  if (f.practice && !(c.practice || []).length) return false;
  if (f.fm && !(c.failure_modes || []).length) return false;
  if (f.worked && !(c.worked_examples || []).length) return false;
  return true;
}

function filtersActive() {
  const f = App.ui.filters;
  return !!(f.domain || f.level || f.difficulty || f.status || f.due || f.practice || f.fm || f.worked);
}

function renderSidebar() {
  const repo = App.repo;
  const e = App.engine;
  const f = App.ui.filters;
  const cur = App.ui.route === "concept" ? App.ui.params[0] : null;
  const o = e.overview();
  const sel = (name, label, opts) => `<label>${label}<select data-action="filter" data-name="${name}"><option value="">все</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${f[name] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const chk = (name, label) => `<label class="check"><input type="checkbox" data-action="filter" data-name="${name}" ${f[name] ? "checked" : ""}>${label}</label>`;

  const item = (cid, child) => {
    const c = repo.getConcept(cid);
    if (!conceptPasses(c)) return "";
    const st = e.conceptStats(cid);
    return `<a class="tree-item${child ? " child" : ""}" href="#concept/${esc(cid)}" ${cur === cid ? 'aria-current="page"' : ""} title="${esc(STATE_RU[st.state])}">
      ${stateIcon(st.state)}<span class="t">${esc(c.title)}</span>${st.due ? `<span class="due-dot" aria-label="к повторению ${st.due}">${st.due}</span>` : ""}</a>`;
  };
  const conceptsHtml = (ids) => {
    const set = new Set(ids);
    let h = "";
    for (const id of ids) {
      const parent = repo.parentOf(id);
      if (parent && set.has(parent)) continue;
      h += item(id, false);
      for (const ch of repo.childrenOf(id)) if (set.has(ch)) h += item(ch, true);
    }
    return h;
  };
  const nodeHtml = (node, depth) => {
    const ids = collectDomainConcepts(node);
    const done = ids.filter((id) => ["review", "mastered"].includes(e.conceptState(id))).length;
    const inner = conceptsHtml(node.conceptIds) + node.children.map((ch) => nodeHtml(ch, depth + 1)).join("");
    if (!inner.trim()) return "";
    return `<details class="${depth ? "sub" : ""}" open><summary>${esc(node.name)}<span class="domain-count">${done}/${ids.length}</span></summary><div class="${depth ? "" : "children"}">${inner}</div></details>`;
  };

  const results = App.ui.search ? repo.search(App.ui.search) : [];
  const tree = repo.domainTree().map((d) => nodeHtml(d, 0)).join("");
  $("#sidebar").innerHTML = `
    <div class="search"><label class="sr-only" for="search">Поиск</label>
      <input id="search" type="search" placeholder="Поиск: концепт, вопрос, тег…  /" value="${esc(App.ui.search)}" data-action="search" autocomplete="off"></div>
    ${App.ui.search && App.ui.search.length >= 2 ? `<div class="search-results" role="listbox" aria-label="Результаты поиска">${results.length ? results.map((r) => `<a href="${r.kind === "concept" ? "#concept/" : "#question/"}${esc(r.id)}" data-action="search-go"><span class="kind">${r.kind === "concept" ? "концепт" : "вопрос"} · ${esc(r.sub)}</span>${esc(r.title)}</a>`).join("") : `<a class="muted">Ничего не найдено</a>`}</div>` : ""}
    <div class="side-stats">${o.total} концептов · к повторению сегодня: <strong>${o.due}</strong></div>
    <button class="filters-toggle" data-action="filters-toggle" aria-expanded="${App.ui.filtersOpen}">Фильтры ${filtersActive() ? "● " : ""}${App.ui.filtersOpen ? "▴" : "▾"}</button>
    ${App.ui.filtersOpen ? `<div class="filters">
      ${sel("domain", "Домен", repo.domainTree().map((d) => [d.name, d.name]))}
      ${sel("level", "Уровень", LEVELS.map((l) => [l, `${l} ${LEVEL_TITLES[l]}`]))}
      ${sel("difficulty", "Сложность", [1, 2, 3, 4, 5].map((n) => [String(n), "★".repeat(n)]))}
      ${sel("status", "Статус", STATES.map((s) => [s, `${STATE_ICON[s]} ${STATE_RU[s]}`]))}
      ${chk("due", "К повторению сегодня")}${chk("practice", "Есть практика")}${chk("fm", "Есть failure modes")}${chk("worked", "Есть готовые решения")}
      <button class="btn ghost reset" data-action="filters-reset">Сбросить</button></div>` : ""}
    <nav class="tree" aria-label="Дерево тем">${tree || '<p class="muted small">Под фильтры ничего не подходит</p>'}</nav>`;
}

/* ---------- Действия ---------- */

function currentSession() { return App.ui.session; }

function doShowAnswer() {
  const s = currentSession();
  if (!s || s.done || !s.cur || s.cur.phase !== "answer") return;
  const ta = $("#answer");
  if (ta) s.cur.answer = ta.value;
  const q = App.repo.getQuestion(s.cur.qid);
  if (q.type === "multiple_choice" && !s.cur.mc) { toast("Сначала выбери вариант"); return; }
  s.cur.phase = "revealed";
  render();
  const rv = $("#reveal");
  if (rv) rv.focus({ preventScroll: true });
  announce("Ответ показан");
}

function doDontKnow() {
  const s = currentSession();
  if (!s) return;
  if (s.kind === "exam") return examDontKnow();
  if (s.done || !s.cur || s.cur.phase !== "answer") return;
  const ta = $("#answer");
  if (ta) s.cur.answer = ta.value;
  s.cur.dontKnow = true;
  s.cur.phase = "revealed";
  render();
  const rv = $("#reveal");
  if (rv) rv.focus({ preventScroll: true });
}

function doGrade(selfScore) {
  const s = currentSession();
  if (!s || s.done || !s.cur || s.cur.phase !== "revealed") return;
  const q = App.repo.getQuestion(s.cur.qid);
  const kps = (q.key_points || []).length;
  let score = selfScore;
  let adjusted = false;
  if (!s.cur.dontKnow && q.type !== "multiple_choice" && kps && s.cur.kpTouched) {
    score = LearningEngine.effectiveScore(selfScore, s.cur.checked.length / kps);
    adjusted = score < selfScore;
  }
  const res = App.engine.submitRecall(q.id, score, s.kind);
  s.results.push({ qid: q.id, score });
  s.lastScore = score;
  s.lastLevel = q.level;
  if (score <= 1 && !s.retried.includes(q.id) && !s.retry.includes(q.id) && s.kind !== "single") s.retry.push(q.id);
  const msg = `${GRADE_RU[score]}${adjusted ? " (скорректировано по ключевым пунктам)" : ""} · повтор ${fmtDays(res.interval)}${res.early ? " (досрочно — интервал не растёт)" : ""}`;
  sessionAdvance(s);
  toast(msg);
  render();
}

function examSaveCurrent() {
  const s = currentSession();
  if (!s || s.kind !== "exam" || s.phase !== "answering") return;
  const qid = s.queue[s.index];
  const ta = $("#answer");
  if (ta && !ta.disabled) s.answers[qid] = ta.value;
}

function examDontKnow() {
  const s = currentSession();
  if (s.phase !== "answering") return;
  const qid = s.queue[s.index];
  if (s.dontKnow.includes(qid)) s.dontKnow = s.dontKnow.filter((x) => x !== qid);
  else { s.dontKnow.push(qid); examSaveCurrent(); }
  render();
}

function examFinish() {
  const s = currentSession();
  examSaveCurrent();
  const unanswered = s.queue.filter((qid) => !s.dontKnow.includes(qid) && !(s.answers[qid] || "").trim()).length;
  if (unanswered && !confirm(`Без ответа: ${unanswered}. Завершить и перейти к проверке?`)) return;
  s.phase = "grading";
  s.gradeIndex = 0;
  render();
}

function examGrade(selfScore) {
  const s = currentSession();
  const qid = s.queue[s.gradeIndex];
  const q = App.repo.getQuestion(qid);
  let score = selfScore;
  const kps = (q.key_points || []).length;
  if (q.type !== "multiple_choice" && kps && s.touched[qid]) score = LearningEngine.effectiveScore(selfScore, (s.checked[qid] || []).length / kps);
  s.grades[qid] = score;
  App.engine.submitRecall(qid, score, "exam");
  s.gradeIndex++;
  if (s.gradeIndex >= s.queue.length) {
    s.phase = "result";
    s.done = true;
    App.engine.recordExam({ id: "exam-" + Date.now(), set_id: s.setId, date: new Date().toISOString(), total: s.queue.length, by_level: examByLevel(s) });
  }
  render();
}

function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function readFile(input, cb) {
  const file = input.files && input.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try { cb(JSON.parse(r.result)); } catch (e) { alert("Не удалось прочитать JSON: " + e.message); }
    input.value = "";
  };
  r.readAsText(file);
}

function applyTheme() {
  const t = Settings.get().theme;
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function revealSection(cid, key, scroll = true) {
  const set = revealedSet(cid);
  if (!set.includes(key)) set.push(key);
  if (scroll) App.ui.scrollTo = "sec-" + key;
}

const ACTIONS = {
  "toggle-sidebar": () => $("#app").classList.toggle("side-open"),
  "toggle-theme": () => {
    const cur = Settings.get().theme;
    const dark = cur === "dark" || (cur === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    Settings.set({ theme: dark ? "light" : "dark" });
    applyTheme();
    MermaidRender.theme = null;
    render();
  },
  "reveal-section": (el) => { revealSection(App.ui.conceptId, el.dataset.section); render(); },
  "visual-step": (el) => {
    const vid = el.dataset.vid;
    const [cid, lvl, idx] = vid.split(":");
    const v = App.repo.getConcept(cid).short_answer.visuals[lvl][Number(idx)];
    const n = v.steps.length;
    const cur = App.ui.visualStep[vid] || 1;
    const dir = el.dataset.dir;
    App.ui.visualStep[vid] = dir === "all" ? n : dir === "reset" ? 1 : Math.max(1, Math.min(n, cur + Number(dir)));
    const fig = el.closest("figure.visual");
    const tmp = document.createElement("div");
    tmp.innerHTML = Visuals.render(v, vid, App.ui.visualStep[vid]);
    const next = tmp.firstElementChild;
    if (fig.classList.contains("expanded")) next.classList.add("expanded");
    const old = fig.querySelector(".v-canvas");
    if (old && old.innerHTML) next.querySelector(".v-canvas").style.minHeight = old.offsetHeight + "px";
    fig.replaceWith(next);
    MermaidRender.renderIn(next).then(() => { const c = next.querySelector(".v-canvas"); if (c) c.style.minHeight = ""; });
    Glossary.link(next, cid, App.repo.domainOf(cid));
    const btn = next.querySelector('[data-dir="1"]') || next.querySelector('[data-dir="reset"]');
    if (btn) btn.focus({ preventScroll: true });
    persistUi();
  },
  "visual-expand": (el) => openVisualModal(el.closest("figure.visual")),
  "visual-close": () => closeVisualModal(),
  "concept-tab": (el) => { Settings.set({ concept_tab: el.dataset.tab }); App.ui.scrollTo = el.dataset.tab === "short" ? "short-answer" : null; render(); },
  "answer-level": (el) => { Settings.set({ answer_level: el.dataset.level }); render(); },
  "story-next": (el) => {
    const cid = el.dataset.id;
    App.ui.story[cid] = (App.ui.story[cid] || 0) + 1;
    const c = App.repo.getConcept(cid);
    const n = App.ui.story[cid];
    App.ui.scrollTo = n >= c.story.beats.length ? "summary" : "beat-" + n;
    App.ui.scrollBlock = "nearest";
    render();
  },
  "story-skip": (el) => {
    const c = App.repo.getConcept(el.dataset.id);
    App.ui.story[c.id] = c.story.beats.length;
    App.ui.scrollTo = "summary";
    render();
  },
  "story-restart": (el) => { App.ui.story[el.dataset.id] = 0; App.ui.scrollTo = "beat-0"; render(); },
  "reveal-all": () => {
    const c = App.repo.getConcept(App.ui.conceptId);
    LEARN_SECTIONS.filter((s) => sectionAvailable(c, s.key)).forEach((s) => revealSection(c.id, s.key, false));
    render();
  },
  "goto-concept": (el, ev) => {
    if (el.dataset.section) {
      ev.preventDefault();
      revealSection(el.dataset.id, el.dataset.section);
      go(`#concept/${el.dataset.id}`);
    }
  },
  "start-recall": (el) => startConceptRecall(el.dataset.id || App.ui.conceptId),
  "start-smart": () => startSmart(),
  "start-review": () => startReview(false),
  "start-warmup": () => startReview(true),
  "start-single": (el) => startSingle(el.dataset.id),
  "start-keyq": (el) => {
    const d = el.dataset.d || "";
    const queue = keyqQuestions(d, el.dataset.weak === "1").map((q) => q.id);
    App.ui.session = newSession("review", { queue, title: d ? `Ключевые: ${d}` : "Ключевые вопросы", route: "#review" });
    go("#review");
  },
  "start-set-questions": (el) => {
    const ps = App.repo.practiceSets.find((x) => x.id === el.dataset.id);
    App.ui.session = newSession("review", { queue: ps.question_ids.slice(), title: ps.title, route: "#review" });
    go("#review");
  },
  "show-answer": () => doShowAnswer(),
  "dont-know": () => doDontKnow(),
  "show-hint": () => { const s = currentSession(); const ta = $("#answer"); if (ta) s.cur.answer = ta.value; s.cur.hints++; render(); },
  "simplify": () => {
    const s = currentSession();
    const simpler = App.selector.simplify(s.cur.qid, new Set(s.asked));
    if (!simpler) return;
    if (s.kind === "review") s.queue.splice(s.index, 0, simpler);
    setCurrent(s, simpler);
    toast("Вопрос упрощён на уровень ниже");
    render();
  },
  "mc-choose": (el) => {
    const s = currentSession();
    s.cur.mc = el.value;
    const btn = $('[data-action="show-answer"]');
    if (btn) btn.disabled = false;
    persistUi();
  },
  "toggle-kp": (el) => {
    const i = Number(el.dataset.i);
    const name = el.dataset.name;
    const s = currentSession();
    let arr;
    if (name === "practice") {
      const st = App.ui.practice[App.ui.params[0]];
      arr = st.checked;
    } else if (name === "exam") {
      const qid = s.queue[s.gradeIndex];
      arr = s.checked[qid] = s.checked[qid] || [];
      s.touched[qid] = true;
    } else {
      arr = s.cur.checked;
      s.cur.kpTouched = true;
    }
    const k = arr.indexOf(i);
    if (el.checked && k < 0) arr.push(i);
    if (!el.checked && k >= 0) arr.splice(k, 1);
    render();
  },
  "grade": (el) => doGrade(Number(el.dataset.score)),
  "end-session": () => {
    const s = currentSession();
    if (s.kind === "exam") {
      if (!confirm("Прервать экзамен? Ответы не будут проверены.")) return;
      App.ui.session = null;
      go("#exam");
      return;
    }
    s.done = true;
    s.cur = null;
    render();
  },
  "repeat-mistakes": () => {
    const s = currentSession();
    const failed = s.results.filter((r) => r.score <= 1).map((r) => r.qid);
    const uniq = Array.from(new Set(failed));
    App.ui.session = newSession("review", { queue: uniq, title: "Повтор ошибок", route: "#review" });
    go("#review");
  },
  "worked-show": (el) => { App.ui.worked[el.dataset.id] = { mode: "shown", step: 0 }; App.progress.data.worked[el.dataset.id] = { seen_at: new Date().toISOString() }; App.progress.save(); render(); },
  "worked-step": (el) => {
    const st = App.ui.worked[el.dataset.id] || { mode: "blind", step: 0 };
    App.ui.worked[el.dataset.id] = { mode: "guided", step: (st.mode === "guided" ? st.step : 0) + 1 };
    render();
  },
  "worked-reset": (el) => { App.ui.worked[el.dataset.id] = { mode: "blind", step: 0 }; render(); },
  "practice-tab": (el) => { App.ui.practiceTab = el.dataset.tab; if (App.ui.route !== "practice" || App.ui.params[0]) go("#practice"); else render(); },
  "practice-show": (el) => {
    const st = App.ui.practice[el.dataset.id];
    const ta = $("#answer");
    if (ta) st.draft = ta.value;
    st.phase = "revealed";
    render();
  },
  "practice-grade": (el) => {
    const pid = App.ui.params[0];
    const p = App.repo.getPractice(pid);
    const st = App.ui.practice[pid];
    let score = Number(el.dataset.score);
    const n = (p.evaluation_points || []).length;
    if (n && st.checked.length) score = LearningEngine.effectiveScore(score, st.checked.length / n);
    App.engine.recordPractice("practice", pid, score);
    App.ui.practice[pid] = { phase: "answer", draft: st.draft, checked: [] };
    toast(`Записано: ${GRADE_RU[score]}`);
    render();
  },
  "ts-show": (el) => {
    const st = App.ui.practice["ts:" + el.dataset.id];
    for (const k of ["cause", "why", "fix"]) { const ta = $("#ts-" + k); if (ta) st[k] = ta.value; }
    st.phase = "revealed";
    render();
  },
  "ts-grade": (el) => {
    const fid = App.ui.params[1];
    App.engine.recordPractice("troubleshoot", fid, Number(el.dataset.score));
    App.ui.practice["ts:" + fid] = { phase: "answer", cause: "", why: "", fix: "" };
    toast(`Записано: ${GRADE_RU[Number(el.dataset.score)]}`);
    render();
  },
  "exam-set": (el, ev) => { ev.preventDefault(); startExam(el.dataset.id); },
  "exam-size": (el) => { App.ui.examCfg.size = Number(el.dataset.n); render(); },
  "exam-domain": (el) => {
    const d = el.dataset.d;
    const arr = App.ui.examCfg.domains;
    const i = arr.indexOf(d);
    if (i >= 0) arr.splice(i, 1); else arr.push(d);
    render();
  },
  "exam-keyq": (el) => { App.ui.examCfg.keyqOnly = el.checked; persistUi(); },
  "start-exam": () => startExam(null),
  "exam-mc": (el) => { const s = currentSession(); s.answers[s.queue[s.index]] = el.value; persistUi(); },
  "exam-next": () => { examSaveCurrent(); const s = currentSession(); s.index = Math.min(s.queue.length - 1, s.index + 1); render(); },
  "exam-prev": () => { examSaveCurrent(); const s = currentSession(); s.index = Math.max(0, s.index - 1); render(); },
  "exam-dontknow": () => examDontKnow(),
  "exam-finish": () => examFinish(),
  "exam-grade": (el) => examGrade(Number(el.dataset.score)),
  "exam-new": () => { App.ui.session = null; go("#exam"); },
  "filters-toggle": () => { App.ui.filtersOpen = !App.ui.filtersOpen; renderSidebar(); },
  "filters-reset": () => { for (const k of Object.keys(App.ui.filters)) App.ui.filters[k] = typeof App.ui.filters[k] === "boolean" ? false : ""; renderSidebar(); persistUi(); },
  "search-go": () => { App.ui.search = ""; $("#app").classList.remove("side-open"); },
  "set-theme": (el) => { Settings.set({ theme: el.dataset.theme }); applyTheme(); MermaidRender.theme = null; render(); },
  "set-dev": (el) => { Settings.set({ dev: el.checked }); render(); },
  "export-progress": () => download(`learning-progress-${dayKey(Date.now())}.json`, App.progress.export()),
  "reset-progress": () => {
    if (!confirm("Удалить весь прогресс, историю и расписание повторений? Это необратимо. Сначала можно сделать Export progress.")) return;
    App.progress.reset();
    App.ui.session = null;
    toast("Прогресс сброшен");
    render();
  },
  "export-course": () => download("course.json", App.repo.course),
  "reset-course": () => { Store.remove(STORAGE_KEYS.course); location.hash = "#home"; location.reload(); },
  "fatal-continue": () => { App.forceStart = true; boot(); },
  "return-session": () => { const s = currentSession(); if (s) go(s.route); },
};

const CHANGE_ACTIONS = {
  "filter": (el) => {
    App.ui.filters[el.dataset.name] = el.type === "checkbox" ? el.checked : el.value;
    renderSidebar();
    persistUi();
  },
  "set-limit": (el) => { const n = Math.max(5, Math.min(200, Number(el.value) || 20)); Settings.set({ daily_review_limit: n }); },
  "import-progress": (el) => readFile(el, (obj) => {
    try { App.progress.import(obj); toast("Прогресс импортирован"); applyTheme(); render(); } catch (e) { alert(e.message); }
  }),
  "import-course": (el) => readFile(el, (obj) => {
    const v = validateCourse(obj);
    if (v.fatal || v.errors.length) {
      if (!confirm(`В курсе ${v.errors.length} ошибок (первая: ${v.errors[0] && v.errors[0].problem}). Всё равно загрузить?`)) return;
    }
    if (!Store.set(STORAGE_KEYS.course, obj)) { alert("Не удалось сохранить курс в localStorage (слишком большой?)"); return; }
    location.hash = "#home";
    location.reload();
  }),
};

function onClick(ev) {
  const term = ev.target.closest(".term");
  if (term) {
    const pop = $("#term-pop");
    if (pop && !pop.hidden && pop.dataset.for === term.dataset.g) hideTermPop();
    else showTermPop(term);
    return;
  }
  if (!ev.target.closest("#term-pop")) hideTermPop();
  const el = ev.target.closest("[data-action]");
  if (!el) {
    // клик по ссылке в сайдбаре на мобильном закрывает его
    if (ev.target.closest(".sidebar a")) $("#app").classList.remove("side-open");
    return;
  }
  const act = el.dataset.action;
  if (el.tagName === "INPUT" || el.tagName === "SELECT") return; // обрабатываются в change
  const fn = ACTIONS[act];
  if (fn) {
    if (el.tagName === "BUTTON") ev.preventDefault();
    fn(el, ev);
  }
  if (el.closest(".sidebar") && el.tagName === "A") $("#app").classList.remove("side-open");
}

function onChange(ev) {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const act = el.dataset.action;
  if (CHANGE_ACTIONS[act]) CHANGE_ACTIONS[act](el);
  else if (ACTIONS[act] && (el.tagName === "INPUT")) ACTIONS[act](el, ev);
}

let searchTimer = null;
function onInput(ev) {
  const el = ev.target;
  if (el.dataset.action === "search") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      App.ui.search = el.value;
      const pos = el.selectionStart;
      renderSidebar();
      const inp = $("#search");
      inp.focus();
      try { inp.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }, 120);
    return;
  }
  const d = el.dataset.draft;
  if (!d) return;
  const s = currentSession();
  if (d === "session" && s && s.cur) s.cur.answer = el.value;
  else if (d.startsWith("exam:") && s && s.kind === "exam") s.answers[d.slice(5)] = el.value;
  else if (d.startsWith("practice:")) {
    const pid = d.slice(9);
    (App.ui.practice[pid] = App.ui.practice[pid] || { phase: "answer", draft: "", checked: [] }).draft = el.value;
    saveDraft(d, el.value);
  } else if (d.startsWith("worked:")) {
    const wid = d.slice(7);
    (App.ui.worked[wid] = App.ui.worked[wid] || { mode: "blind", step: 0 }).draft = el.value;
  } else if (d.startsWith("ts:")) {
    const [, fid, field] = d.split(":");
    const st = App.ui.practice["ts:" + fid];
    if (st) st[field] = el.value;
  }
  clearTimeout(onInput.t);
  onInput.t = setTimeout(persistUi, 400);
}

function clickIf(selector) {
  const el = $(selector);
  if (el && !el.disabled) { el.click(); return true; }
  return false;
}

function onKey(ev) {
  const tag = (ev.target.tagName || "").toLowerCase();
  const typing = tag === "textarea" || (tag === "input" && !["checkbox", "radio"].includes(ev.target.type)) || tag === "select";
  if (typing) {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      clickIf("#main [data-primary]");
    } else if (ev.key === "Escape") {
      ev.target.blur();
    }
    return;
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const mode = MODES.find((m) => m.code === ev.code);
  if (mode) { ev.preventDefault(); go(mode.route); return; }
  switch (ev.code) {
    case "Slash": ev.preventDefault(); $("#app").classList.add("side-open"); $("#search").focus(); break;
    case "Space":
      if (clickIf("#main [data-reveal]")) ev.preventDefault();
      break;
    case "Enter":
      if (tag === "button" || tag === "a") return;
      if (clickIf("#main [data-primary]")) ev.preventDefault();
      break;
    case "KeyN": clickIf("#main [data-next]"); break;
    case "KeyK": clickIf("#main [data-dontknow]"); break;
    case "KeyR": clickIf("#main [data-repeat]"); break;
    case "Escape": if (closeVisualModal()) break; $("#app").classList.remove("side-open"); hideTermPop(); break;
    default: break;
  }
}

/* ---------- Загрузка курса ---------- */

async function loadCourse() {
  const custom = Store.get(STORAGE_KEYS.course, null);
  if (custom && custom.concepts) return { course: custom, source: "custom" };
  const el = document.getElementById("course-data");
  const raw = el ? el.textContent.trim() : "";
  if (raw && raw !== "{{COURSE_JSON}}") {
    try { return { course: JSON.parse(raw), source: "embedded" }; } catch (e) {
      return { error: { errors: [{ problem: "Встроенный JSON повреждён: " + e.message, where: "#course-data" }] } };
    }
  }
  try {
    const r = await fetch("course.json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return { course: await r.json(), source: "fetch" };
  } catch (e) {
    return { error: { errors: [{ problem: "Курс не найден: нет встроенных данных и не удалось загрузить course.json (" + e.message + ")", where: "loadCourse" }] } };
  }
}

async function boot() {
  applyTheme();
  const main = $("#main");
  const loaded = await loadCourse();
  if (loaded.error) {
    main.innerHTML = viewFatal(loaded.error, false);
    return;
  }
  const v = validateCourse(loaded.course);
  App.validation = v;
  if (new URLSearchParams(location.search).has("force")) App.forceStart = true;
  if (v.fatal || (v.errors.length && !App.forceStart)) {
    main.innerHTML = viewFatal(v, !v.fatal);
    $("#sidebar").innerHTML = "";
    return;
  }
  App.source = loaded.source;
  App.repo = new CourseRepository(loaded.course);
  App.progress = new ProgressRepository(App.repo.meta.id || "course");
  App.engine = new LearningEngine(App.repo, App.progress);
  App.selector = new QuestionSelector(App.repo, App.progress, App.engine);
  Glossary.init(loaded.course.glossary);
  const drafts = loadDrafts();
  for (const k of Object.keys(drafts)) if (k.startsWith("practice:")) App.ui.practice[k.slice(9)] = { phase: "answer", draft: drafts[k], checked: [] };
  restoreUi();
  $("#brand").textContent = App.repo.meta.title || "Тренажёр";
  document.title = (App.repo.meta.title || "Тренажёр") + " — тренажёр";
  render();
}

if (typeof document !== "undefined") {
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKey);
  document.addEventListener("mouseover", (e) => { const t = e.target.closest && e.target.closest(".term"); if (t) showTermPop(t); });
  document.addEventListener("mouseout", (e) => { const t = e.target.closest && e.target.closest(".term"); if (t) scheduleHideTermPop(); });
  document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest(".term"); if (t) showTermPop(t); });
  document.addEventListener("focusout", (e) => { if (e.target.closest && e.target.closest(".term") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("#term-pop"))) scheduleHideTermPop(); });
  window.addEventListener("resize", () => { hideTermPop(); document.querySelectorAll(".v-canvas").forEach(fitVisual); });
  $("#main").addEventListener("scroll", hideTermPop, { passive: true });
  window.addEventListener("hashchange", render);
  window.addEventListener("error", (e) => {
    if (Settings.get().dev) toast("JS error: " + e.message);
  });
  boot();
}

if (typeof module !== "undefined") {
  module.exports = { md, validateCourse, CourseRepository, ProgressRepository, LearningEngine, QuestionSelector, Scheduler, Store, layeredGraphSvg, renderMentalModel };
}
