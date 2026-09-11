/* ===================================================================
 * STATE + REPOSITORIES + SCHEDULER + QUESTION SELECTOR + LEARNING ENGINE
 * Course Data неизменяем; User State хранится отдельно в localStorage.
 * =================================================================== */

const STORAGE_KEYS = {
  course: "learning_course",
  progress: "learning_progress",
  settings: "learning_settings",
  history: "learning_history",
};

const Store = {
  mem: {},
  get(key, fallback) {
    try {
      const raw = globalThis.localStorage ? localStorage.getItem(key) : this.mem[key];
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (globalThis.localStorage) localStorage.setItem(key, raw);
      else this.mem[key] = raw;
      return true;
    } catch (e) {
      this.mem[key] = raw;
      return false;
    }
  },
  remove(key) {
    try { if (globalThis.localStorage) localStorage.removeItem(key); } catch (e) { /* ignore */ }
    delete this.mem[key];
  },
};

/* ----- CourseRepository: только чтение контента ----- */
class CourseRepository {
  constructor(course) {
    this.course = course;
    this.meta = course.course || {};
    this.concepts = course.concepts.slice();
    this.byId = new Map(this.concepts.map((c) => [c.id, c]));
    const nodes = (course.knowledge_map && course.knowledge_map.nodes) || [];
    this.nodeById = new Map(nodes.map((n) => [n.concept_id, n]));
    this.order = new Map();
    this.concepts.forEach((c, i) => {
      const n = this.nodeById.get(c.id);
      this.order.set(c.id, n && typeof n.order === "number" ? n.order : 100000 + i);
    });
    this.concepts.sort((a, b) => this.order.get(a.id) - this.order.get(b.id));
    this.relations = ((course.knowledge_map && course.knowledge_map.relations) || [])
      .filter((r) => this.byId.has(r.from) && this.byId.has(r.to));

    this.questions = [];
    this.qById = new Map();
    this.practice = [];
    this.pById = new Map();
    this.worked = [];
    this.wById = new Map();
    this.failures = [];
    this.fmById = new Map();
    for (const c of this.concepts) {
      for (const q of c.retrieval || []) {
        const item = Object.assign({ conceptId: c.id }, q);
        this.questions.push(item);
        this.qById.set(q.id, item);
      }
      for (const p of c.practice || []) {
        const item = Object.assign({ conceptId: c.id }, p);
        this.practice.push(item);
        this.pById.set(p.id, item);
      }
      for (const w of c.worked_examples || []) {
        const item = Object.assign({ conceptId: c.id }, w);
        this.worked.push(item);
        this.wById.set(w.id, item);
      }
      for (const f of c.failure_modes || []) {
        const item = Object.assign({ conceptId: c.id }, f);
        this.failures.push(item);
        this.fmById.set(f.id, item);
      }
    }
    this.practiceSets = course.practice_sets || [];
    this.examSets = course.exam_sets || [];
    this.learningPath = this._learningPath();
    this.pathIndex = new Map(this.learningPath.map((id, i) => [id, i]));
  }

  getConcept(id) { return this.byId.get(id) || null; }
  getQuestions(conceptId) { return this.questions.filter((q) => q.conceptId === conceptId); }
  getQuestion(qid) { return this.qById.get(qid) || null; }
  getPractice(pid) { return this.pById.get(pid) || null; }
  getWorked(wid) { return this.wById.get(wid) || null; }
  getFailure(fid) { return this.fmById.get(fid) || null; }

  /** Связанные концепты: related_concepts + связи карты (кроме requires, они в prerequisites). */
  getRelatedConcepts(id) {
    const c = this.getConcept(id);
    const out = new Map();
    const add = (cid, label) => {
      if (cid === id || !this.byId.has(cid) || out.has(cid)) return;
      out.set(cid, { concept: this.byId.get(cid), relation: label });
    };
    for (const r of (c && c.related_concepts) || []) {
      if (r.relation !== "prerequisite") add(r.concept_id, r.relation === "next" ? "дальше" : r.relation === "alternative" ? "альтернатива" : "связано");
    }
    for (const r of this.relations) {
      if (r.type === "requires" || r.type === "prerequisite") continue;
      if (r.from === id) add(r.to, RELATION_RU[r.type] || r.type);
      else if (r.to === id) add(r.from, RELATION_RU[r.type] || r.type);
    }
    // Концепты, для которых текущий — prerequisite
    for (const other of this.concepts) {
      if ((other.prerequisites || []).includes(id)) add(other.id, "дальше");
    }
    return Array.from(out.values());
  }

  /** Самая длинная цепочка prerequisites, ведущая к концепту (для заголовка). */
  prerequisiteChain(id, maxLen = 4) {
    const memo = new Map();
    const longest = (cid, seen) => {
      if (memo.has(cid)) return memo.get(cid);
      const c = this.getConcept(cid);
      let best = [];
      for (const p of (c && c.prerequisites) || []) {
        if (seen.has(p) || !this.byId.has(p)) continue;
        seen.add(p);
        const chain = longest(p, seen);
        seen.delete(p);
        if (chain.length + 1 > best.length) best = chain.concat([p]);
      }
      memo.set(cid, best);
      return best;
    };
    const chain = longest(id, new Set([id]));
    return chain.slice(-maxLen);
  }

  domainPath(c) {
    return String(c.domain || "Без домена").split(" / ").map((s) => s.trim()).filter(Boolean);
  }

  /** Дерево: [{name, key, order, children: [...], conceptIds: [...]}] */
  domainTree() {
    const root = { children: [], map: new Map() };
    for (const c of this.concepts) {
      let level = root;
      const path = this.domainPath(c);
      let key = "";
      for (const name of path) {
        key = key ? `${key} / ${name}` : name;
        if (!level.map.has(name)) {
          const node = { name, key, order: this.order.get(c.id), children: [], map: new Map(), conceptIds: [] };
          level.map.set(name, node);
          level.children.push(node);
        }
        level = level.map.get(name);
      }
      level.conceptIds.push(c.id);
    }
    return root.children;
  }

  domainOf(conceptId) {
    const c = this.getConcept(conceptId);
    return c ? this.domainPath(c)[0] : "";
  }

  childrenOf(conceptId) {
    return this.concepts.filter((c) => {
      const n = this.nodeById.get(c.id);
      return n && n.parent_id === conceptId;
    }).map((c) => c.id);
  }

  parentOf(conceptId) {
    const n = this.nodeById.get(conceptId);
    return n && n.parent_id && this.byId.has(n.parent_id) ? n.parent_id : null;
  }

  /** Рекомендуемый порядок изучения: топологическая сортировка prerequisites с учётом order. */
  _learningPath() {
    const indeg = new Map();
    const next = new Map();
    for (const c of this.concepts) { indeg.set(c.id, 0); next.set(c.id, []); }
    for (const c of this.concepts) {
      for (const p of c.prerequisites || []) {
        if (!this.byId.has(p)) continue;
        indeg.set(c.id, indeg.get(c.id) + 1);
        next.get(p).push(c.id);
      }
    }
    const ready = this.concepts.filter((c) => indeg.get(c.id) === 0).map((c) => c.id);
    const out = [];
    while (ready.length) {
      ready.sort((a, b) => this.order.get(a) - this.order.get(b));
      const id = ready.shift();
      out.push(id);
      for (const m of next.get(id)) {
        indeg.set(m, indeg.get(m) - 1);
        if (indeg.get(m) === 0) ready.push(m);
      }
    }
    for (const c of this.concepts) if (!out.includes(c.id)) out.push(c.id); // на случай цикла
    return out;
  }

  conceptDifficulty(id) {
    const qs = this.getQuestions(id);
    if (!qs.length) return 0;
    return Math.round(qs.reduce((s, q) => s + (q.difficulty || 1), 0) / qs.length);
  }

  search(query, limit = 30) {
    const q = normalizeSearch(query).trim();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/);
    const hit = (s) => { const n = normalizeSearch(s); return terms.every((t) => n.includes(t)); };
    const res = [];
    for (const c of this.concepts) {
      let score = 0;
      if (hit(c.title)) score += 10;
      if ((c.tags || []).some(hit)) score += 5;
      if (hit(c.summary)) score += 3;
      if ((c.details || []).some((d) => hit(d.title) || hit(d.description))) score += 1;
      if (score) res.push({ kind: "concept", id: c.id, title: c.title, sub: c.domain, score });
    }
    for (const qq of this.questions) {
      if (hit(qq.question) || (qq.tags || []).some(hit)) {
        res.push({ kind: "question", id: qq.id, title: qq.question, sub: this.getConcept(qq.conceptId).title, score: 2 });
      }
    }
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, limit);
  }
}

/* ----- ProgressRepository: User State ----- */
class ProgressRepository {
  constructor(courseId) {
    this.courseId = courseId;
    this.data = this._load();
    this.history = Store.get(STORAGE_KEYS.history, []);
    if (!Array.isArray(this.history)) this.history = [];
  }

  _empty() {
    return { version: 1, course_id: this.courseId, concepts: {}, questions: {}, practice: {}, troubleshoot: {}, worked: {}, exams: [] };
  }

  _load() {
    const d = Store.get(STORAGE_KEYS.progress, null);
    if (!d || typeof d !== "object" || d.version !== 1) return this._empty();
    const e = this._empty();
    for (const k of Object.keys(e)) if (d[k] == null) d[k] = e[k];
    return d;
  }

  save() {
    Store.set(STORAGE_KEYS.progress, this.data);
  }

  saveHistory() {
    if (this.history.length > 4000) this.history = this.history.slice(-4000);
    Store.set(STORAGE_KEYS.history, this.history);
  }

  getQuestion(qid) { return this.data.questions[qid] || null; }
  saveQuestion(qid, rec) { this.data.questions[qid] = rec; }
  getConceptProgress(id) { return this.data.concepts[id] || null; }
  saveConceptProgress(id, data) { this.data.concepts[id] = Object.assign({}, this.data.concepts[id], data); }

  markViewed(id, now) {
    const cur = this.data.concepts[id] || {};
    if (!cur.viewed_at) {
      this.saveConceptProgress(id, { viewed_at: new Date(now).toISOString() });
      this.save();
    }
  }

  getDueQuestions(now) {
    const end = startOfDay(now) + DAY;
    return Object.keys(this.data.questions).filter((qid) => {
      const r = this.data.questions[qid];
      return r.next_review && Date.parse(r.next_review) < end;
    });
  }

  addHistory(entry) {
    this.history.push(entry);
    this.saveHistory();
  }

  export() {
    return { exported_at: new Date().toISOString(), progress: this.data, history: this.history, settings: Store.get(STORAGE_KEYS.settings, {}) };
  }

  import(obj) {
    const d = obj && obj.progress ? obj.progress : obj;
    if (!d || d.version !== 1 || typeof d.questions !== "object") throw new Error("Файл не похож на экспорт прогресса (нужен version: 1 и questions)");
    this.data = Object.assign(this._empty(), d);
    this.history = Array.isArray(obj.history) ? obj.history : [];
    this.save();
    this.saveHistory();
    if (obj.settings && typeof obj.settings === "object") Store.set(STORAGE_KEYS.settings, obj.settings);
  }

  reset() {
    this.data = this._empty();
    this.history = [];
    Store.remove(STORAGE_KEYS.progress);
    Store.remove(STORAGE_KEYS.history);
  }
}

/* ----- Settings ----- */
const Settings = {
  defaults: { daily_review_limit: 20, theme: "system", dev: false, exam_size: 20, concept_tab: "story", answer_level: "middle" },
  get() { return Object.assign({}, this.defaults, Store.get(STORAGE_KEYS.settings, {})); },
  set(patch) { Store.set(STORAGE_KEYS.settings, Object.assign(this.get(), patch)); },
};

/* ----- Scheduler: прозрачный вариант интервального повторения -----
 * score 0 → сброс, повтор через 1 день
 * score 1 → повтор через 1 день
 * score 2 → интервал × 2 (первый успех — 1 день)
 * score 3 → интервал × 3 (первый успех — 3 дня)
 * Максимум — 60 дней. Досрочный ответ (до due) интервал не увеличивает.
 */
const Scheduler = {
  MAX_INTERVAL: 60,
  calculateNextReview(prev, score, now) {
    const prevInterval = prev && prev.interval ? prev.interval : 0;
    const due = prev && prev.next_review ? Date.parse(prev.next_review) : 0;
    const early = prevInterval > 0 && due > startOfDay(now) + DAY;
    let interval;
    if (score <= 1) interval = 1;
    else if (early) interval = prevInterval;
    else if (score === 2) interval = prevInterval ? Math.round(prevInterval * 2) : 1;
    else interval = prevInterval ? Math.round(prevInterval * 3) : 3;
    interval = Math.max(1, Math.min(this.MAX_INTERVAL, interval));
    const streak = score >= 2 ? ((prev && prev.streak) || 0) + 1 : 0;
    return { interval, streak, early, next_review: new Date(startOfDay(now) + interval * DAY).toISOString() };
  },
};

/* ----- Evaluator: семантическая проверка выключена (офлайн). -----
 * Точка расширения: можно подставить LLM-оценщик, который вернёт
 * {score, key_points, missing_points, feedback}. Сейчас — self assessment.
 */
const Evaluator = {
  enabled: false,
  async evaluate(/* question, answer */) { return null; },
};

/* ----- LearningEngine ----- */
class LearningEngine {
  constructor(courseRepo, progressRepo, clock = () => Date.now()) {
    this.course = courseRepo;
    this.progress = progressRepo;
    this.now = clock;
  }

  /** Потолок оценки по доле отмеченных ключевых пунктов (если пользователь их отмечал). */
  static effectiveScore(selfScore, coverage) {
    if (coverage == null) return selfScore;
    let cap = 3;
    if (coverage < 0.3) cap = 0;
    else if (coverage < 0.6) cap = 1;
    else if (coverage < 0.9) cap = 2;
    return Math.min(selfScore, cap);
  }

  submitRecall(qid, score, mode = "recall") {
    const q = this.course.getQuestion(qid);
    if (!q) return null;
    const now = this.now();
    const prev = this.progress.getQuestion(qid) || { attempts: 0, correct: 0, scores: [], success_days: [] };
    const sched = Scheduler.calculateNextReview(prev, score, now);
    const successDays = (prev.success_days || []).slice();
    if (score >= 2 && !successDays.includes(dayKey(now))) successDays.push(dayKey(now));
    const rec = {
      attempts: (prev.attempts || 0) + 1,
      correct: (prev.correct || 0) + (score >= 2 ? 1 : 0),
      last_attempt: new Date(now).toISOString(),
      last_score: score,
      best_score: Math.max(prev.best_score == null ? -1 : prev.best_score, score),
      scores: (prev.scores || []).concat(score).slice(-6),
      success_days: successDays.slice(-10),
      interval: sched.interval,
      streak: sched.streak,
      next_review: sched.next_review,
    };
    this.progress.saveQuestion(qid, rec);
    this.progress.addHistory({ t: now, q: qid, s: score, m: mode });
    this._refreshConcept(q.conceptId);
    this.progress.save();
    return { rec, interval: sched.interval, early: sched.early };
  }

  _refreshConcept(conceptId) {
    const st = this.conceptStats(conceptId);
    const qs = this.course.getQuestions(conceptId).map((q) => this.progress.getQuestion(q.id)).filter(Boolean);
    const next = qs.map((r) => r.next_review).filter(Boolean).sort()[0] || null;
    const last = qs.map((r) => r.last_attempt).filter(Boolean).sort().pop() || null;
    this.progress.saveConceptProgress(conceptId, {
      state: st.state,
      recall_score: Math.round(st.avgScore * 10) / 10,
      attempts: qs.reduce((s, r) => s + r.attempts, 0),
      correct: qs.reduce((s, r) => s + r.correct, 0),
      last_review: last,
      next_review: next,
    });
  }

  recordPractice(kind, id, score) {
    const bucket = this.progress.data[kind];
    const prev = bucket[id] || { attempts: 0, best: -1 };
    bucket[id] = { attempts: prev.attempts + 1, best: Math.max(prev.best, score), last_score: score, last_attempt: new Date(this.now()).toISOString() };
    this.progress.addHistory({ t: this.now(), p: id, s: score, m: kind });
    this.progress.save();
  }

  recordExam(result) {
    this.progress.data.exams = (this.progress.data.exams || []).concat(result).slice(-30);
    this.progress.save();
  }

  /** Состояние концепта: new / learning / review / mastered. */
  conceptState(conceptId) {
    return this.conceptStats(conceptId).state;
  }

  conceptStats(conceptId) {
    const qs = this.course.getQuestions(conceptId);
    const now = this.now();
    const end = startOfDay(now) + DAY;
    const recs = qs.map((q) => ({ q, r: this.progress.getQuestion(q.id) }));
    const attempted = recs.filter((x) => x.r && x.r.attempts > 0);
    const strong = attempted.filter((x) => x.r.last_score >= 2);
    const weak = attempted.filter((x) => x.r.last_score <= 1);
    const due = attempted.filter((x) => x.r.next_review && Date.parse(x.r.next_review) < end);
    let state = "new";
    if (attempted.length) {
      const needStrong = Math.min(2, qs.length);
      const matured = strong.filter((x) => x.r.interval >= 7 && (x.r.success_days || []).length >= 2);
      if (weak.length || strong.length < needStrong) state = "learning";
      else if (matured.length >= Math.min(3, qs.length)) state = "mastered";
      else state = "review";
    }
    const bar = (levels) => {
      const sel = recs.filter((x) => levels.includes(x.q.level));
      if (!sel.length) return null;
      return sel.reduce((s, x) => s + (x.r ? x.r.last_score : 0), 0) / (3 * sel.length);
    };
    const avgScore = attempted.length ? attempted.reduce((s, x) => s + x.r.last_score, 0) / attempted.length : 0;
    return {
      state,
      total: qs.length,
      attempted: attempted.length,
      strong: strong.length,
      weak: weak.length,
      due: due.length,
      avgScore,
      bars: { recall: bar(["L1"]), understanding: bar(["L2"]), application: bar(["L3", "L4", "L5", "L6"]) },
    };
  }

  getDueReviews() {
    return this.progress.getDueQuestions(this.now()).map((id) => this.course.getQuestion(id)).filter(Boolean);
  }

  /** Сводка для дашборда. */
  overview() {
    const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
    let viewed = 0;
    for (const c of this.course.concepts) {
      counts[this.conceptState(c.id)]++;
      const cp = this.progress.getConceptProgress(c.id);
      if ((cp && cp.viewed_at) || this.conceptStats(c.id).attempted) viewed++;
    }
    const due = this.getDueReviews();
    const byPriority = { critical: 0, important: 0, secondary: 0 };
    for (const q of due) byPriority[q.priority || "important"]++;
    const since = this.now() - 30 * DAY;
    const recent = this.progress.history.filter((h) => h.q && h.t >= since);
    const accuracy = recent.length ? recent.filter((h) => h.s >= 2).length / recent.length : null;
    const practiceDone = this.course.practice.filter((p) => this.progress.data.practice[p.id]).length;
    const keyq = this.course.questions.filter((q) => q.key_question);
    const keyqDone = keyq.filter((q) => { const r = this.progress.getQuestion(q.id); return r && r.last_score >= 2; }).length;
    return {
      total: this.course.concepts.length, viewed, counts, due: due.length, byPriority, accuracy,
      attemptsRecent: recent.length, practiceDone, practiceTotal: this.course.practice.length,
      keyqTotal: keyq.length, keyqDone,
    };
  }

  weakConcepts(limit = 6) {
    return this.course.concepts
      .map((c) => ({ c, st: this.conceptStats(c.id) }))
      .filter((x) => x.st.attempted > 0 && (x.st.weak > 0 || x.st.avgScore < 2))
      .sort((a, b) => a.st.avgScore - b.st.avgScore || b.st.weak - a.st.weak)
      .slice(0, limit);
  }

  nextToLearn(limit = 5) {
    return this.course.learningPath
      .filter((id) => this.conceptState(id) === "new")
      .slice(0, limit)
      .map((id) => this.course.getConcept(id));
  }
}

/* ----- QuestionSelector ----- */
class QuestionSelector {
  constructor(courseRepo, progressRepo, engine) {
    this.course = courseRepo;
    this.progress = progressRepo;
    this.engine = engine;
  }

  _levelIdx(l) { return Math.max(0, LEVELS.indexOf(l)); }

  /** Первый вопрос сессии по концепту: самый ранний уровень среди «не освоенных». */
  firstInConcept(conceptId) {
    const qs = this.course.getQuestions(conceptId);
    if (!qs.length) return null;
    const unmastered = qs.filter((q) => { const r = this.progress.getQuestion(q.id); return !r || r.last_score < 3; });
    const pool = unmastered.length ? unmastered : qs;
    return pool.slice().sort((a, b) => this._levelIdx(a.level) - this._levelIdx(b.level) || a.difficulty - b.difficulty)[0].id;
  }

  /** Адаптивный следующий вопрос в концепте: уверенно → уровень выше, не вспомнил → ниже. */
  nextInConcept(conceptId, asked, lastScore, lastLevel) {
    const pool = this.course.getQuestions(conceptId).filter((q) => !asked.has(q.id));
    if (!pool.length) return null;
    let target = lastLevel ? this._levelIdx(lastLevel) : 0;
    if (lastScore === 3) target += 1;
    else if (lastScore != null && lastScore <= 1) target -= 1;
    target = Math.max(0, Math.min(5, target));
    const scored = pool.map((q) => {
      const r = this.progress.getQuestion(q.id);
      const dist = Math.abs(this._levelIdx(q.level) - target);
      const weakness = r ? (3 - r.last_score) * 0.1 : 0.15;
      const upPenalty = this._levelIdx(q.level) > target ? 0.05 : 0;
      return { q, s: dist - weakness + upPenalty };
    });
    scored.sort((a, b) => a.s - b.s);
    return scored[0].q.id;
  }

  /** «Упростить вопрос»: вопрос того же концепта на уровень ниже. */
  simplify(qid, asked) {
    const q = this.course.getQuestion(qid);
    if (!q) return null;
    const lvl = this._levelIdx(q.level);
    const cands = this.course.getQuestions(q.conceptId)
      .filter((x) => x.id !== qid && !asked.has(x.id) && this._levelIdx(x.level) < lvl)
      .sort((a, b) => this._levelIdx(b.level) - this._levelIdx(a.level));
    return cands.length ? cands[0].id : null;
  }

  /**
   * Глобальный выбор (режим Recall без концепта). Приоритет:
   * 1. просроченные вопросы, 2. слабые концепты, 3. новые концепты, 4. закрепление сильных.
   */
  selectNext(exclude = new Set()) {
    const now = this.engine.now();
    const due = this.engine.getDueReviews().filter((q) => !exclude.has(q.id));
    if (due.length) {
      due.sort((a, b) => Date.parse(this.progress.getQuestion(a.id).next_review) - Date.parse(this.progress.getQuestion(b.id).next_review));
      return { qid: due[0].id, reason: "Просрочено" };
    }
    for (const { c } of this.engine.weakConcepts(10)) {
      const weakQ = this.course.getQuestions(c.id).find((q) => {
        const r = this.progress.getQuestion(q.id);
        return !exclude.has(q.id) && r && r.last_score <= 1;
      });
      if (weakQ) return { qid: weakQ.id, reason: "Слабая концепция" };
    }
    for (const id of this.course.learningPath) {
      const fresh = this.course.getQuestions(id)
        .filter((q) => !exclude.has(q.id) && !this.progress.getQuestion(q.id))
        .sort((a, b) => this._levelIdx(a.level) - this._levelIdx(b.level));
      if (fresh.length) return { qid: fresh[0].id, reason: "Новое" };
    }
    const rest = this.course.questions
      .filter((q) => !exclude.has(q.id))
      .map((q) => ({ q, r: this.progress.getQuestion(q.id) }))
      .sort((a, b) => ((a.r && a.r.interval) || 0) - ((b.r && b.r.interval) || 0));
    void now;
    return rest.length ? { qid: rest[0].q.id, reason: "Закрепление" } : null;
  }

  /** Перемешивание по доменам (interleaving) с сохранением приоритета внутри домена. */
  interleave(questions) {
    const groups = new Map();
    for (const q of questions) {
      const d = this.course.domainOf(q.conceptId);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(q);
    }
    const lists = Array.from(groups.values());
    const out = [];
    let lastConcept = null;
    while (lists.some((l) => l.length)) {
      for (const l of lists) {
        if (!l.length) continue;
        let idx = l.findIndex((q) => q.conceptId !== lastConcept);
        if (idx < 0) idx = 0;
        const [q] = l.splice(idx, 1);
        out.push(q);
        lastConcept = q.conceptId;
      }
    }
    return out;
  }

  reviewQueue(limit) {
    const prio = { critical: 0, important: 1, secondary: 2 };
    const due = this.engine.getDueReviews().sort((a, b) =>
      (prio[a.priority || "important"] - prio[b.priority || "important"]) ||
      (Date.parse(this.progress.getQuestion(a.id).next_review) - Date.parse(this.progress.getQuestion(b.id).next_review)));
    return this.interleave(due.slice(0, limit)).map((q) => q.id);
  }

  /** Вопросы для «разогрева», если повторять нечего: L1–L2 первых новых концептов по маршруту. */
  warmupQueue(limit) {
    const out = [];
    for (const id of this.course.learningPath) {
      if (this.engine.conceptState(id) !== "new") continue;
      const qs = this.course.getQuestions(id).filter((q) => q.level === "L1" || q.level === "L2").slice(0, 2);
      out.push(...qs);
      if (out.length >= limit) break;
    }
    return this.interleave(out.slice(0, limit)).map((q) => q.id);
  }

  /** Экзамен: либо exam_set, либо баланс уровней по пропорции 4/5/5/3/2/1 на 20 вопросов. */
  examQueue({ setId = null, size = 20, domains = null, keyqOnly = false, rnd = Math.random } = {}) {
    if (setId) {
      const set = this.course.examSets.find((s) => s.id === setId);
      if (set) return set.question_ids.filter((id) => this.course.getQuestion(id));
    }
    let pool = this.course.questions.filter((q) => q.type !== "multiple_choice" || true);
    if (domains && domains.length) pool = pool.filter((q) => domains.includes(this.course.domainOf(q.conceptId)));
    if (keyqOnly) pool = pool.filter((q) => q.key_question);
    const ratio = { L1: 4, L2: 5, L3: 5, L4: 3, L5: 2, L6: 1 };
    const totalRatio = 20;
    const byLevel = {};
    for (const l of LEVELS) byLevel[l] = shuffle(pool.filter((q) => q.level === l), rnd);
    const picked = [];
    const usedConcepts = new Map();
    const take = (l, n) => {
      const list = byLevel[l];
      let taken = 0;
      // сначала вопросы из ещё не использованных концептов
      for (let pass = 0; pass < 2 && taken < n; pass++) {
        for (let i = 0; i < list.length && taken < n; i++) {
          const q = list[i];
          if (!q || picked.includes(q)) continue;
          if (pass === 0 && (usedConcepts.get(q.conceptId) || 0) >= 1) continue;
          picked.push(q);
          usedConcepts.set(q.conceptId, (usedConcepts.get(q.conceptId) || 0) + 1);
          taken++;
        }
      }
      return taken;
    };
    let deficit = 0;
    for (const l of LEVELS) {
      const want = Math.round((ratio[l] / totalRatio) * size);
      deficit += want - take(l, want);
    }
    if (deficit > 0) {
      for (const l of ["L3", "L2", "L4", "L1", "L5", "L6"]) {
        if (deficit <= 0) break;
        deficit -= take(l, deficit);
      }
    }
    return this.interleave(shuffle(picked, rnd)).map((q) => q.id);
  }
}
