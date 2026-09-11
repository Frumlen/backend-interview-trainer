"use strict";
/* ===================================================================
 * CORE: утилиты, мини-разметка, валидатор курса.
 * Файлы app/js/*.js склеиваются tools/build.py в один <script> по порядку имён.
 * =================================================================== */

const DAY = 86400000;
const LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"];
const LEVEL_TITLES = {
  L1: "Recall", L2: "Understanding", L3: "Application",
  L4: "Troubleshooting", L5: "Design", L6: "Expert / Trade-offs",
};
const LEVEL_RU = {
  L1: "Вспомнить", L2: "Понимание", L3: "Применение",
  L4: "Диагностика", L5: "Проектирование", L6: "Trade-offs",
};
const QUESTION_TYPES = ["short_answer", "multiple_choice", "explain", "predict", "debug", "design", "decision"];
const TYPE_RU = {
  short_answer: "Короткий ответ", multiple_choice: "Выбор варианта", explain: "Объясни",
  predict: "Предскажи", debug: "Найди ошибку", design: "Спроектируй", decision: "Выбери решение",
};
const PRACTICE_TYPES = ["code", "debug", "design", "analysis", "prediction"];
const RELATION_TYPES = ["requires", "prerequisite", "related", "contrasts_with", "alternative_to", "part_of", "extends", "causes", "solves"];
const RELATION_RU = {
  requires: "требует", prerequisite: "prerequisite", related: "связано", contrasts_with: "в отличие от",
  alternative_to: "альтернатива", part_of: "часть", extends: "расширяет", causes: "приводит к", solves: "решает",
};
const MM_TYPES = ["diagram", "timeline", "state_machine", "data_flow", "sequence", "memory_layout", "layered_model", "tree", "table", "formula", "none"];
const STATES = ["new", "learning", "review", "mastered"];
const STATE_ICON = { new: "○", learning: "◐", review: "●", mastered: "✓" };
const STATE_RU = { new: "Новое", learning: "Изучается", review: "Повторение", mastered: "Освоено" };
const GRADE_RU = ["Не вспомнил", "Частично", "Вспомнил", "Уверенно"];
const PRIORITY_RU = { critical: "Critical", important: "Important", secondary: "Optional" };
const CLAIM_RU = {
  confirmed: "подтверждено", uncertain: "не уверено",
  potentially_outdated: "может быть устаревшим", disputed: "спорно",
};
const EXTRA_PREFIX = "[доп] ";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Строка списка может начинаться с "[доп] " — дополнительный материал. */
function splitExtra(s) {
  s = String(s == null ? "" : s);
  if (s.startsWith(EXTRA_PREFIX)) return { extra: true, text: s.slice(EXTRA_PREFIX.length) };
  if (s.startsWith("[доп]")) return { extra: true, text: s.slice(5).trim() };
  return { extra: false, text: s };
}

function inlineMd(s) {
  // s уже экранирована
  return s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[доп\]\s?/g, '<span class="badge extra" title="Дополнительный материал">доп.</span> ');
}

/** Мини-разметка: ```блоки кода```, `inline`, **жирный**, строки "- " как списки, абзацы. */
function md(text) {
  if (text == null || text === "") return "";
  const src = String(text).replace(/\r\n/g, "\n");
  const out = [];
  const parts = src.split(/```/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const m = parts[i].match(/^([a-zA-Z0-9_+-]*)\n?([\s\S]*)$/);
      const lang = m ? m[1] : "";
      const code = (m ? m[2] : parts[i]).replace(/\n$/, "");
      out.push(codeBlock(code, lang));
      continue;
    }
    const chunk = parts[i];
    for (const para of chunk.split(/\n\s*\n/)) {
      const lines = para.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) continue;
      let buf = [];
      let list = [];
      const flushBuf = () => {
        if (buf.length) out.push("<p>" + buf.map((l) => inlineMd(esc(l))).join("<br>") + "</p>");
        buf = [];
      };
      const flushList = () => {
        if (list.length) out.push("<ul>" + list.map((l) => "<li>" + inlineMd(esc(l)) + "</li>").join("") + "</ul>");
        list = [];
      };
      for (const l of lines) {
        const lm = l.match(/^\s*[-•*]\s+(.*)$/);
        if (lm) { flushBuf(); list.push(lm[1]); } else { flushList(); buf.push(l); }
      }
      flushBuf();
      flushList();
    }
  }
  return out.join("");
}

/** Короткий текст без блоков: только inline-разметка. */
function mdInline(text) {
  return inlineMd(esc(text == null ? "" : text)).replace(/\n/g, "<br>");
}

function codeBlock(code, lang) {
  return `<div class="codebox">${lang ? `<span class="lang">${esc(lang)}</span>` : ""}<pre><code>${esc(code)}</code></pre></div>`;
}

function normalizeSearch(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е");
}

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function fmtDays(n) {
  if (n <= 0) return "сегодня";
  if (n === 1) return "завтра";
  return `через ${n} ${plural(n, "день", "дня", "дней")}`;
}

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pct(x) {
  return Math.round(x * 100);
}

/* ===================================================================
 * VALIDATOR: validateCourse(course) -> {errors: [{problem, where}], warnings: [...]}
 * =================================================================== */

function validateCourse(course) {
  const errors = [];
  const warnings = [];
  const err = (problem, where) => errors.push({ problem, where });
  const warn = (problem, where) => warnings.push({ problem, where });

  if (!course || typeof course !== "object") {
    err("Курс не является объектом", "root");
    return { errors, warnings, fatal: true };
  }
  if (!["1.0", "1.1"].includes(course.schema_version)) err(`Неподдерживаемая schema_version "${course.schema_version}"`, "schema_version");
  if (!course.course || typeof course.course !== "object") err("Нет объекта course", "course");
  if (!Array.isArray(course.concepts)) {
    err("Нет массива concepts", "concepts");
    return { errors, warnings, fatal: true };
  }
  const km = course.knowledge_map || {};
  if (!Array.isArray(km.nodes) || !Array.isArray(km.relations)) err("knowledge_map требует nodes и relations", "knowledge_map");

  const conceptIds = new Set();
  const allIds = new Map();
  const claimId = (id, where) => {
    if (!id) { err("Пустой id", where); return; }
    if (allIds.has(id)) err(`Дубликат id "${id}" (уже в ${allIds.get(id)})`, where);
    else allIds.set(id, where);
  };
  const required = ["id", "title", "domain", "level", "summary", "mental_model", "problem", "mechanism", "minimal_example", "retrieval", "prerequisites", "related_concepts"];

  course.concepts.forEach((c, i) => {
    const w = `concepts[${i}]${c && c.id ? ` (${c.id})` : ""}`;
    if (!c || typeof c !== "object") { err("Концепт не объект", w); return; }
    for (const f of required) if (!(f in c)) err(`Нет обязательного поля "${f}"`, w);
    if (c.id) {
      if (conceptIds.has(c.id)) err(`Дубликат concept id "${c.id}"`, w);
      conceptIds.add(c.id);
    }
    if (!LEVELS.includes(c.level)) err(`Недопустимый level "${c.level}"`, w);
    if (c.mental_model && !MM_TYPES.includes(c.mental_model.type)) warn(`Неизвестный mental_model.type "${c.mental_model.type}"`, w);
    if (c.story != null && !(c.story && Array.isArray(c.story.beats) && c.story.beats.every((b) => b.problem && b.solution))) err("story требует beats с problem и solution", w);
    (c.retrieval || []).forEach((q, j) => {
      const qw = `${w}.retrieval[${j}]`;
      claimId(q.id, qw);
      if (!QUESTION_TYPES.includes(q.type)) err(`Недопустимый type вопроса "${q.type}"`, qw);
      if (!LEVELS.includes(q.level)) err(`Недопустимый level вопроса "${q.level}"`, qw);
      if (!(q.difficulty >= 1 && q.difficulty <= 5)) err(`difficulty вне диапазона 1–5`, qw);
      if (!q.question) err("Пустой question", qw);
      if (q.type === "multiple_choice" && !(Array.isArray(q.options) && q.options.some((o) => o.correct))) err("multiple_choice без правильного варианта", qw);
    });
    (c.practice || []).forEach((p, j) => {
      claimId(p.id, `${w}.practice[${j}]`);
      if (!PRACTICE_TYPES.includes(p.type)) err(`Недопустимый type практики "${p.type}"`, `${w}.practice[${j}]`);
    });
    (c.worked_examples || []).forEach((x, j) => claimId(x.id, `${w}.worked_examples[${j}]`));
    (c.failure_modes || []).forEach((x, j) => claimId(x.id, `${w}.failure_modes[${j}]`));
  });

  course.concepts.forEach((c, i) => {
    const w = `concepts[${i}] (${c.id})`;
    (c.prerequisites || []).forEach((p, j) => { if (!conceptIds.has(p)) err(`Unknown concept_id "${p}"`, `${w}.prerequisites[${j}]`); });
    (c.related_concepts || []).forEach((r, j) => { if (!conceptIds.has(r.concept_id)) err(`Unknown concept_id "${r.concept_id}"`, `${w}.related_concepts[${j}]`); });
    (c.comparison || []).forEach((r, j) => { if (!conceptIds.has(r.concept_id)) err(`Unknown concept_id "${r.concept_id}"`, `${w}.comparison[${j}]`); });
  });
  (km.nodes || []).forEach((n, i) => {
    if (!conceptIds.has(n.concept_id)) err(`Unknown concept_id "${n.concept_id}"`, `knowledge_map.nodes[${i}]`);
    if (n.parent_id != null && !conceptIds.has(n.parent_id)) err(`Unknown parent_id "${n.parent_id}"`, `knowledge_map.nodes[${i}]`);
  });
  (km.relations || []).forEach((r, i) => {
    const w = `knowledge_map.relations[${i}]`;
    if (!conceptIds.has(r.from)) err(`Unknown concept_id "${r.from}"`, w);
    if (!conceptIds.has(r.to)) err(`Unknown concept_id "${r.to}"`, w);
    if (!RELATION_TYPES.includes(r.type)) err(`Недопустимый тип связи "${r.type}"`, w);
  });
  const practiceIds = new Set(course.concepts.flatMap((c) => (c.practice || []).map((p) => p.id)));
  const questionIds = new Set(course.concepts.flatMap((c) => (c.retrieval || []).map((q) => q.id)));
  (course.practice_sets || []).forEach((ps, i) => {
    const w = `practice_sets[${i}]`;
    (ps.concept_ids || []).forEach((id) => { if (!conceptIds.has(id)) err(`Unknown concept_id "${id}"`, w); });
    (ps.practice_ids || []).forEach((id) => { if (!practiceIds.has(id)) err(`Unknown practice_id "${id}"`, w); });
    (ps.question_ids || []).forEach((id) => { if (!questionIds.has(id)) err(`Unknown question_id "${id}"`, w); });
  });
  (course.exam_sets || []).forEach((ex, i) => {
    (ex.question_ids || []).forEach((id) => { if (!questionIds.has(id)) err(`Unknown question_id "${id}"`, `exam_sets[${i}]`); });
  });

  (course.glossary || []).forEach((t, i) => {
    if (!t.term || !t.definition) err("Термин глоссария без term/definition", `glossary[${i}]`);
    if (t.concept_id != null && !conceptIds.has(t.concept_id)) err(`Unknown concept_id "${t.concept_id}"`, `glossary[${i}]`);
  });
  course.concepts.forEach((c, i) => {
    if (c.short_answer != null && !["junior", "middle", "senior"].every((k) => typeof c.short_answer[k] === "string")) err("short_answer требует junior, middle, senior", `concepts[${i}] (${c.id})`);
  });

  // Циклические prerequisites (включая requires-связи карты)
  const deps = new Map();
  for (const c of course.concepts) deps.set(c.id, new Set(c.prerequisites || []));
  for (const r of km.relations || []) {
    if ((r.type === "requires" || r.type === "prerequisite") && deps.has(r.to)) deps.get(r.to).add(r.from);
  }
  const color = new Map();
  const stack = [];
  let cycle = null;
  const dfs = (n) => {
    color.set(n, 1);
    stack.push(n);
    for (const m of deps.get(n) || []) {
      if (cycle) return;
      if (color.get(m) === 1) { cycle = stack.slice(stack.indexOf(m)).concat(m); return; }
      if (!color.get(m)) dfs(m);
    }
    stack.pop();
    color.set(n, 2);
  };
  for (const n of deps.keys()) { if (!color.get(n) && !cycle) dfs(n); }
  if (cycle) err(`Циклические prerequisites: ${cycle.join(" → ")}`, "knowledge_map");

  // Контент не должен содержать runtime state
  const forbidden = ["user_progress", "recall_score", "last_review", "next_review", "attempts", "mastered"];
  const scan = (o, path) => {
    if (Array.isArray(o)) o.forEach((v, i) => scan(v, `${path}[${i}]`));
    else if (o && typeof o === "object") for (const k of Object.keys(o)) {
      if (forbidden.includes(k)) warn(`Поле пользовательского состояния "${k}" в контенте`, path);
      scan(o[k], `${path}.${k}`);
    }
  };
  scan(course.concepts, "concepts");

  return { errors, warnings, fatal: false };
}
