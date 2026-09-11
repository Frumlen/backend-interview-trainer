/* ===================================================================
 * RENDERERS: чистые функции course data → HTML-строка.
 * Контент не содержит HTML; всё экранируется здесь.
 * =================================================================== */

function extraBadge(title = "Дополнительный материал") {
  return `<span class="badge extra" title="${esc(title)}">доп.</span>`;
}

function levelBadge(level) {
  return `<span class="badge lvl" title="${esc(LEVEL_TITLES[level] || "")}">${esc(level)} · ${esc(LEVEL_RU[level] || "")}</span>`;
}

function stars(n) {
  if (!n) return "";
  return `<span class="stars" aria-label="Сложность ${n} из 5">${"★".repeat(n)}${"☆".repeat(Math.max(0, 5 - n))}</span>`;
}

function stateIcon(state) {
  return `<span class="st st-${state}" aria-hidden="true">${STATE_ICON[state]}</span>`;
}

function stateLabel(state) {
  return `${stateIcon(state)}<span>${STATE_RU[state]}</span>`;
}

/** Список строк, где элементы могут быть помечены "[доп] ". */
function strList(items, cls = "") {
  if (!items || !items.length) return "";
  return `<ul class="${cls}">${items.map((s) => {
    const x = splitExtra(s);
    return `<li>${mdInline(x.text)}${x.extra ? " " + extraBadge() : ""}</li>`;
  }).join("")}</ul>`;
}

/* ---------- Mental model ---------- */

function parseRelation(s) {
  const x = splitExtra(s).text;
  const m = x.match(/^\s*(.+?)\s*(?:->|→|=>)\s*(.+?)\s*$/);
  if (!m) return null;
  let to = m[2];
  let label = "";
  const lm = to.match(/^(.+?)\s*:\s*(.+)$/);
  if (lm) { to = lm[1]; label = lm[2]; }
  return { from: m[1].trim(), to: to.trim(), label: label.trim() };
}

function wrapLabel(text, max = 24) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/.{0,2}$/, "…"); }
  return lines;
}

function textWidth(s, px = 7.1) {
  let w = 0;
  for (const ch of String(s)) w += /[A-ZА-ЯЁWMШЩЖЮ]/.test(ch) ? px * 1.2 : /[ilj.,:;|!'()]/.test(ch) ? px * 0.55 : px;
  return w;
}

/**
 * Послойная раскладка ориентированного графа сверху вниз.
 * nodes: [{id, label, cls?, href?}], edges: [{from, to, label?}]
 */
function layeredGraphSvg(nodes, edges, opts = {}) {
  if (!nodes.length) return "";
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) if (byId.has(e.from) && byId.has(e.to) && e.from !== e.to) out.get(e.from).push(e.to);

  // Удаляем обратные рёбра (циклы) через DFS в порядке узлов
  const state = new Map();
  const back = new Set();
  const dfs = (n) => {
    state.set(n, 1);
    for (const m of out.get(n)) {
      if (state.get(m) === 1) back.add(n + "\u0000" + m);
      else if (!state.get(m)) dfs(m);
    }
    state.set(n, 2);
  };
  for (const n of nodes) if (!state.get(n.id)) dfs(n.id);

  // Слой = длина самого длинного пути от источника
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const order = [];
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const n of nodes) for (const m of out.get(n.id)) if (!back.has(n.id + "\u0000" + m)) indeg.set(m, indeg.get(m) + 1);
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (q.length) {
    const n = q.shift();
    order.push(n);
    for (const m of out.get(n)) {
      if (back.has(n + "\u0000" + m)) continue;
      layer.set(m, Math.max(layer.get(m), layer.get(n) + 1));
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) q.push(m);
    }
  }
  const layers = [];
  for (const n of nodes) {
    const l = layer.get(n.id);
    (layers[l] = layers[l] || []).push(n.id);
  }
  // Упорядочиваем узлы в слое по средней позиции родителей (barycenter)
  const pos = new Map();
  layers.forEach((ids, li) => {
    if (li > 0) {
      const parentsOf = (id) => nodes.filter((p) => out.get(p.id).includes(id) && layer.get(p.id) < li).map((p) => pos.get(p.id));
      ids.sort((a, b) => {
        const pa = parentsOf(a), pb = parentsOf(b);
        const ma = pa.length ? pa.reduce((s, x) => s + x, 0) / pa.length : 0;
        const mb = pb.length ? pb.reduce((s, x) => s + x, 0) / pb.length : 0;
        return ma - mb;
      });
    }
    ids.forEach((id, i) => pos.set(id, i - (ids.length - 1) / 2));
  });

  const maxChars = opts.maxChars || 22;
  const sizes = new Map(nodes.map((n) => {
    const lines = wrapLabel(n.label, maxChars);
    const w = Math.max(64, Math.min(200, Math.max(...lines.map((l) => textWidth(l))) + 24));
    return [n.id, { lines, w, h: 14 + lines.length * 16 }];
  }));
  const gapX = 22, gapY = opts.gapY || 46;
  const layerW = layers.map((ids) => ids.reduce((s, id) => s + sizes.get(id).w, 0) + gapX * (ids.length - 1));
  const width = Math.max(...layerW) + 40;
  const layerH = layers.map((ids) => Math.max(...ids.map((id) => sizes.get(id).h)));
  const coords = new Map();
  let y = 16;
  layers.forEach((ids, li) => {
    let x = (width - layerW[li]) / 2;
    for (const id of ids) {
      const s = sizes.get(id);
      coords.set(id, { x, y: y + (layerH[li] - s.h) / 2, w: s.w, h: s.h, cx: x + s.w / 2 });
      x += s.w + gapX;
    }
    y += layerH[li] + gapY;
  });
  const height = y - gapY + 16;
  const uid = "g" + Math.random().toString(36).slice(2, 8);

  let edgesSvg = "";
  let labelsSvg = "";
  for (const e of edges) {
    const a = coords.get(e.from), b = coords.get(e.to);
    if (!a || !b || e.from === e.to) continue;
    const isBack = back.has(e.from + "\u0000" + e.to) || layer.get(e.to) <= layer.get(e.from);
    let d, lx, ly;
    if (!isBack) {
      const x1 = a.cx, y1 = a.y + a.h, x2 = b.cx, y2 = b.y - 2;
      const my = (y1 + y2) / 2;
      d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      lx = (x1 + x2) / 2; ly = my;
    } else {
      const side = Math.max(a.x + a.w, b.x + b.w) + 18;
      const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
      d = `M${a.x + a.w},${y1} C${side},${y1} ${side},${y2} ${b.x + b.w + 2},${y2}`;
      lx = side - 4; ly = (y1 + y2) / 2;
    }
    edgesSvg += `<path class="edge${isBack ? " back" : ""}" d="${d}" marker-end="url(#${uid}-arr)"/>`;
    if (e.label) {
      const lw = textWidth(e.label, 6.2) + 8;
      labelsSvg += `<rect class="edge-label-bg" x="${lx - lw / 2}" y="${ly - 9}" width="${lw}" height="16" rx="3"/>` +
        `<text class="edge-label" x="${lx}" y="${ly + 3}" text-anchor="middle">${esc(e.label)}</text>`;
    }
  }
  let nodesSvg = "";
  for (const n of nodes) {
    const c = coords.get(n.id);
    const s = sizes.get(n.id);
    const text = s.lines.map((l, i) => `<tspan x="${c.cx}" y="${c.y + 22 + i * 16}">${esc(l)}</tspan>`).join("");
    const inner = `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="7"/><text text-anchor="middle">${text}</text>`;
    const cls = `node${n.href ? " link" : ""}${n.cls ? " " + n.cls : ""}`;
    nodesSvg += n.href
      ? `<a href="${esc(n.href)}" class="${cls}" aria-label="${esc(n.aria || n.label)}"><title>${esc(n.aria || n.label)}</title>${inner}</a>`
      : `<g class="${cls}">${inner}</g>`;
  }
  return `<div class="scroll-x"><svg class="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.aria || "Схема")}">
<defs><marker id="${uid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker></defs>
${edgesSvg}${labelsSvg}${nodesSvg}</svg></div>`;
}

function sequenceSvg(actors, messages) {
  const colW = Math.max(120, Math.min(190, Math.max(...actors.map((a) => textWidth(a) + 30))));
  const width = colW * actors.length + 20;
  const top = 44, rowH = 34;
  const height = top + messages.length * rowH + 24;
  const uid = "s" + Math.random().toString(36).slice(2, 8);
  const cx = (i) => 10 + colW * i + colW / 2;
  let svg = "";
  actors.forEach((a, i) => {
    const w = Math.min(colW - 14, textWidth(a) + 22);
    svg += `<line class="lifeline" x1="${cx(i)}" y1="${top - 8}" x2="${cx(i)}" y2="${height - 8}"/>`;
    svg += `<g class="actor"><rect x="${cx(i) - w / 2}" y="6" width="${w}" height="28" rx="6"/><text x="${cx(i)}" y="25" text-anchor="middle">${esc(a)}</text></g>`;
  });
  messages.forEach((m, k) => {
    const i = actors.indexOf(m.from), j = actors.indexOf(m.to);
    const y = top + k * rowH + 18;
    if (i === j) {
      const x = cx(i);
      svg += `<path class="msg" d="M${x},${y - 6} h26 v12 h-24" marker-end="url(#${uid}-arr)"/>`;
      svg += `<text class="msg-label" x="${x + 32}" y="${y + 4}">${esc(m.label)}</text>`;
    } else {
      const x1 = cx(i), x2 = cx(j);
      const dir = x2 > x1 ? -1 : 1;
      svg += `<line class="msg" x1="${x1}" y1="${y}" x2="${x2 + dir * 3}" y2="${y}" marker-end="url(#${uid}-arr)"/>`;
      svg += `<text class="msg-label" x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle">${esc(m.label)}</text>`;
    }
  });
  return `<div class="scroll-x"><svg class="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sequence diagram">
<defs><marker id="${uid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker></defs>${svg}</svg></div>`;
}

function renderTable(t) {
  if (!t || !t.columns) return "";
  return `<div class="scroll-x"><table class="tbl"><thead><tr>${t.columns.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead>
<tbody>${(t.rows || []).map((r) => `<tr>${r.map((cell) => `<td>${mdInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderMentalModel(mm) {
  if (!mm || !mm.type || (mm.type === "none" && !mm.description)) return "";
  const parts = [];
  if (mm.description) parts.push(`<div class="mm-desc">${mdInline(mm.description)}</div>`);
  const rels = (mm.relations || []).map(parseRelation).filter(Boolean);
  if (mm.table) parts.push(renderTable(mm.table));
  if (mm.diagram) parts.push(`<pre class="diagram" aria-label="Схема">${esc(mm.diagram)}</pre>`);
  if (!mm.table && !mm.diagram && mm.type !== "none") {
    if (mm.type === "sequence" && rels.length) {
      const actors = [];
      for (const e of mm.elements || []) if (!actors.includes(e)) actors.push(splitExtra(e).text);
      for (const r of rels) for (const a of [r.from, r.to]) if (!actors.includes(a)) actors.push(a);
      parts.push(sequenceSvg(actors, rels));
    } else if (rels.length) {
      const ids = [];
      for (const e of mm.elements || []) { const t = splitExtra(e).text; if (!ids.includes(t)) ids.push(t); }
      for (const r of rels) for (const a of [r.from, r.to]) if (!ids.includes(a)) ids.push(a);
      // Изолированные элементы (без связей) показываем чипами, чтобы не раздувать граф
      const linked = new Set(rels.flatMap((r) => [r.from, r.to]));
      const nodes = ids.filter((id) => linked.has(id)).map((id) => ({ id, label: id }));
      parts.push(layeredGraphSvg(nodes, rels, { aria: mm.description || "Mental model" }));
      const lonely = ids.filter((id) => !linked.has(id));
      if (lonely.length) parts.push(`<div class="elements">${lonely.map((e) => `<span>${esc(e)}</span>`).join("")}</div>`);
    } else if ((mm.elements || []).length) {
      parts.push(`<div class="elements">${mm.elements.map((e) => `<span>${esc(splitExtra(e).text)}</span>`).join("")}</div>`);
    }
  }
  return parts.join("");
}

/* ---------- Секции концепта ---------- */

function renderMechanism(mech) {
  if (!mech) return "";
  const steps = (mech.steps || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  let h = "";
  if (steps.length) {
    h += `<ol class="steps">${steps.map((s) => `<li class="${s.origin === "extra" ? "is-extra" : ""}"><strong>${mdInline(s.title)} ${s.origin === "extra" ? extraBadge() : ""}</strong>${md(s.description)}</li>`).join("")}</ol>`;
  }
  if ((mech.key_objects || []).length) {
    h += `<div class="section-title" style="margin-top:12px">Ключевые объекты</div><div class="elements">${mech.key_objects.map((o) => { const x = splitExtra(o); return `<span>${esc(x.text)}${x.extra ? " ·доп." : ""}</span>`; }).join("")}</div>`;
  }
  if ((mech.important_distinctions || []).length) {
    h += `<div class="section-title" style="margin-top:14px">Важно различать</div>${strList(mech.important_distinctions)}`;
  }
  return h;
}

function renderExample(ex) {
  if (!ex || (!ex.code && !ex.explanation)) return "";
  let h = "";
  if (ex.code) h += codeBlock(ex.code, ex.language || "");
  if (ex.explanation) h += md(ex.explanation);
  if (ex.expected_result) h += `<p class="small"><span class="muted">Результат:</span> <code>${esc(ex.expected_result)}</code></p>`;
  return h;
}

function renderDetails(details, invariants) {
  let h = "";
  const order = { critical: 0, important: 1, secondary: 2 };
  const ds = (details || []).slice().sort((a, b) => order[a.importance] - order[b.importance]);
  if (ds.length) {
    h += `<div class="item-list">${ds.map((d) => `<div class="detail ${esc(d.importance)} ${d.origin === "extra" ? "is-extra" : ""}">
      <div class="h">${mdInline(d.title)} <span class="badge ${d.importance === "critical" ? "critical" : d.importance === "important" ? "important" : ""}">${esc(d.importance)}</span>${d.origin === "extra" ? extraBadge() : ""}</div>
      ${md(d.description)}</div>`).join("")}</div>`;
  }
  if ((invariants || []).length) {
    h += `<div class="section-title" style="margin-top:16px">Инварианты — что всегда верно</div>
    <div class="item-list">${invariants.map((iv) => `<div class="${iv.origin === "extra" ? "is-extra" : ""}"><strong>${mdInline(iv.statement)}</strong> ${iv.origin === "extra" ? extraBadge() : ""}<div class="muted small">${mdInline(iv.why)}</div></div>`).join("")}</div>`;
  }
  return h;
}

function renderFailureModes(fms, conceptId) {
  if (!fms || !fms.length) return "";
  return `<div class="item-list">${fms.map((f) => `<div class="fm ${f.origin === "extra" ? "is-extra" : ""}">
    <div class="h">${mdInline(f.title)} ${f.origin === "extra" ? extraBadge() : ""}</div>
    <dl class="fm-chain">
      ${f.cause ? `<dt>Причина</dt><dd>${mdInline(f.cause)}</dd>` : ""}
      ${f.symptom ? `<dt>Симптом</dt><dd>${mdInline(f.symptom)}</dd>` : ""}
      ${f.mechanism ? `<dt>Механизм</dt><dd>${mdInline(f.mechanism)}</dd>` : ""}
      ${f.fix ? `<dt>Решение</dt><dd>${mdInline(f.fix)}</dd>` : ""}
      ${f.prevention ? `<dt>Профилактика</dt><dd>${mdInline(f.prevention)}</dd>` : ""}
    </dl>
    <div class="actions" style="margin-top:8px"><a class="btn ghost" href="#troubleshoot/${esc(conceptId)}/${esc(f.id)}">Потренироваться: найти причину по симптому →</a></div>
  </div>`).join("")}</div>`;
}

function renderTradeoffs(t, u) {
  let h = "";
  if (t && ((t.benefits || []).length || (t.costs || []).length || (t.risks || []).length)) {
    h += `<div class="two-col plus-minus">
      <div><h4>Что получаем</h4>${strList(t.benefits) || '<p class="muted small">—</p>'}</div>
      <div><h4>Чем платим</h4>${strList(t.costs) || '<p class="muted small">—</p>'}</div>
    </div>`;
    if ((t.risks || []).length) h += `<h4 class="small" style="margin-top:8px;color:var(--text-2)">Риски</h4>${strList(t.risks)}`;
    if (t.when_tradeoff_matters) h += `<p class="small"><span class="muted">Когда это важно:</span> ${mdInline(t.when_tradeoff_matters)}</p>`;
  }
  if (u && ((u.use_when || []).length || (u.avoid_when || []).length)) {
    h += `<div class="two-col plus-minus" style="margin-top:12px">
      <div><h4>Use when</h4>${strList(u.use_when) || '<p class="muted small">—</p>'}</div>
      <div><h4>Avoid when</h4>${strList(u.avoid_when) || '<p class="muted small">—</p>'}</div>
    </div>`;
    if ((u.signals || []).length) h += `<h4 class="small" style="margin-top:8px;color:var(--text-2)">Сигналы, что подходит</h4>${strList(u.signals)}`;
    if ((u.production_considerations || []).length) h += `<h4 class="small" style="margin-top:8px;color:var(--text-2)">В production</h4>${strList(u.production_considerations)}`;
  }
  return h;
}

function renderComparison(items, repo, currentTitle) {
  if (!items || !items.length) return "";
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.concept_id)) groups.set(it.concept_id, []);
    groups.get(it.concept_id).push(it);
  }
  let h = "";
  for (const [cid, list] of groups) {
    const other = repo.getConcept(cid);
    h += `<h4 style="margin-top:6px">${esc(currentTitle)} <span class="muted">vs</span> <a href="#concept/${esc(cid)}">${esc(other ? other.title : cid)}</a></h4>
    <div class="scroll-x"><table class="tbl"><thead><tr><th>Измерение</th><th>Разница</th><th>Почему важно</th></tr></thead><tbody>
    ${list.map((x) => `<tr><td>${mdInline(x.dimension)}${x.origin === "extra" ? " " + extraBadge() : ""}</td><td>${mdInline(x.difference)}</td><td>${mdInline(x.why_it_matters)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }
  return h;
}

function renderClaims(claims) {
  if (!claims || !claims.length) return "";
  return `<div class="item-list">${claims.map((c) => `<div class="claim"><span class="s s-${esc(c.status)}">${esc(CLAIM_RU[c.status] || c.status)}</span>
    <div><div>${mdInline(c.statement)}</div>${c.notes ? `<div class="muted small">${mdInline(c.notes)}</div>` : ""}</div></div>`).join("")}</div>`;
}

/* ---------- Вопрос ---------- */

function questionMeta(q, repo, { showConcept = true, exam = false } = {}) {
  const c = repo.getConcept(q.conceptId);
  const b = [];
  if (showConcept && c && !exam) b.push(`<a class="chip" href="#concept/${esc(c.id)}" data-action="goto-concept" data-id="${esc(c.id)}">${esc(c.title)}</a>`);
  b.push(levelBadge(q.level));
  b.push(`<span class="badge">${esc(TYPE_RU[q.type] || q.type)}</span>`);
  if (!exam) {
    if (q.key_question) b.push(`<span class="badge keyq" title="Ключевой вопрос темы">ключевой</span>`);
    if (q.priority === "critical") b.push(`<span class="badge critical">critical</span>`);
    if (q.origin === "extra") b.push(extraBadge());
    b.push(stars(q.difficulty));
  }
  return `<div class="q-head">${b.join("")}</div>`;
}

function renderQuestionBody(q) {
  let h = `<div class="q-text" id="q-text">${mdInline(q.question)}</div>`;
  if (q.context) h += `<div class="q-context">${md(q.context)}</div>`;
  if (q.code) h += codeBlock(q.code, q.code_language || "");
  return h;
}

function renderKeyPoints(q, checked, name = "kp") {
  const kps = q.key_points || [];
  if (!kps.length) return "";
  const hit = kps.filter((_, i) => checked.has(i)).length;
  return `<ul class="kp-list" role="group" aria-label="Ключевые пункты">
    ${kps.map((k, i) => `<li class="${checked.has(i) ? "hit" : "miss"}"><label>
      <input type="checkbox" data-action="toggle-kp" data-i="${i}" data-name="${esc(name)}" ${checked.has(i) ? "checked" : ""}>
      <span class="mark" aria-hidden="true">${checked.has(i) ? "✓" : "✗"}</span><span>${mdInline(k)}</span></label></li>`).join("")}
  </ul>
  <div class="recall-meter">Recall: ${hit}/${kps.length}</div>`;
}

function renderGradeButtons(action = "grade") {
  return `<div class="grade" role="group" aria-label="Самооценка">
    ${GRADE_RU.map((g, i) => `<button class="g${i}" data-action="${action}" data-score="${i}">${esc(g)}<small>${["повтор завтра", "повтор завтра", "интервал ×2", "интервал ×3"][i]}</small></button>`).join("")}
  </div>`;
}

/* ---------- Глоссарий: подсказки терминов при наведении ---------- */

const RU_ENDINGS = ["ами", "ями", "ого", "ому", "ах", "ях", "ам", "ям", "ом", "ем", "ой", "ей", "ов", "ев", "ый", "ым", "ых", "а", "я", "у", "ю", "е", "ы", "и"];

const Glossary = {
  entries: [],
  byKey: new Map(),
  re: null,

  init(list) {
    this.entries = (list || []).filter((t) => t && t.term && t.definition);
    this.byKey = new Map();
    const pats = [];
    this.entries.forEach((e, i) => {
      for (const v of [e.term].concat(e.aliases || [])) {
        const key = String(v).trim().toLowerCase();
        if (!key || this.byKey.has(key)) continue;
        this.byKey.set(key, i);
        const escd = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pats.push({ len: key.length, p: /[а-яё]$/i.test(key) ? `${escd}(?:${RU_ENDINGS.join("|")})?` : escd });
      }
    });
    pats.sort((a, b) => b.len - a.len);
    this.re = pats.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pats.map((x) => x.p).join("|")})(?![\\p{L}\\p{N}_])`, "giu") : null;
  },

  lookup(word) {
    const w = word.toLowerCase();
    if (this.byKey.has(w)) return this.byKey.get(w);
    for (const end of RU_ENDINGS) {
      if (w.endsWith(end) && this.byKey.has(w.slice(0, -end.length))) return this.byKey.get(w.slice(0, -end.length));
    }
    return -1;
  },

  /** Оборачивает первое вхождение каждого термина в каждой карточке в <span class="term">. */
  link(root, currentConceptId, domain) {
    if (!this.re || !root) return;
    const skip = "code,pre,a,button,textarea,input,select,label,h1,h2,svg,kbd,.term,.badge,.chip,.seg,.tab,.q-head,.bn,.section-title,.crumbs,.view-tabs,.actions,.disclose-next,.beat-term,.your-answer,.v-canvas";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const seen = new Map();
    for (const node of nodes) {
      const box = node.parentElement.closest(".card, .q-card, .reveal, .mistake") || root;
      if (!seen.has(box)) seen.set(box, new Set());
      const used = seen.get(box);
      const text = node.nodeValue;
      this.re.lastIndex = 0;
      let m;
      let last = 0;
      const frag = document.createDocumentFragment();
      let changed = false;
      while ((m = this.re.exec(text))) {
        const gi = this.lookup(m[0]);
        const e = this.entries[gi];
        if (gi < 0 || used.has(gi) || (e.concept_id && e.concept_id === currentConceptId)) continue;
        if (e.scope && e.scope.length && domain && !e.scope.includes(domain)) continue;
        used.add(gi);
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement("span");
        span.className = "term";
        span.tabIndex = 0;
        span.dataset.g = String(gi);
        span.textContent = m[0];
        frag.appendChild(span);
        last = m.index + m[0].length;
        changed = true;
      }
      if (!changed) continue;
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  },

  popHtml(gi, currentConceptId, repo) {
    const e = this.entries[gi];
    if (!e) return "";
    const c = e.concept_id && e.concept_id !== currentConceptId ? repo.getConcept(e.concept_id) : null;
    return `<div class="tp-term">${esc(e.term)}</div><div class="tp-def">${mdInline(e.definition)}</div>${c ? `<a class="tp-link" href="#concept/${esc(c.id)}">Открыть раздел: ${esc(c.title)} →</a>` : ""}`;
  },
};

/* ---------- Визуализации (Mermaid): схема + пошаговый режим для sequenceDiagram ---------- */

const Visuals = {
  sources: new Map(),
  STEP_RE: /^(note\s|[^%:]+?(<<)?-{1,2}(>>|>|x|\))[+-]?[^:]*:)/i,
  OPEN_RE: /^(loop|alt|opt|par|rect|critical|break)\b/i,
  KEEP_RE: /^(participant|actor|autonumber)\b/i,

  kind(src) {
    const first = String(src).split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%")) || "";
    return (first.split(/\s+/)[0] || "").toLowerCase();
  },

  stepCount(src) {
    return String(src).split("\n").slice(1).filter((l) => this.STEP_RE.test(l.trim())).length;
  },

  /** Исходник диаграммы только с первыми k сообщениями; участники остаются все, открытые блоки закрываются. */
  partial(src, k) {
    const lines = String(src).split("\n");
    const out = [lines[0]];
    let steps = 0;
    let depth = 0;
    let cut = false;
    for (const raw of lines.slice(1)) {
      const t = raw.trim();
      if (this.KEEP_RE.test(t)) { out.push(raw); continue; }
      if (cut) continue;
      if (this.STEP_RE.test(t)) {
        steps++;
        out.push(raw);
        if (steps >= k) cut = true;
        continue;
      }
      if (this.OPEN_RE.test(t)) depth++;
      else if (/^end\b/i.test(t)) depth = Math.max(0, depth - 1);
      out.push(raw);
    }
    for (let i = 0; i < depth; i++) out.push("end");
    return out.join("\n");
  },

  /** HTML-заготовка; сама SVG дорисовывается асинхронно (renderMermaidIn в 40-main.js). */
  render(v, vid, step) {
    const steps = Array.isArray(v.steps) && v.steps.length ? v.steps : null;
    const n = steps ? steps.length : 0;
    const k = steps ? Math.max(1, Math.min(n, step || 1)) : 0;
    const src = steps && k < n ? this.partial(v.mermaid, k) : v.mermaid;
    this.sources.set(vid, src);
    let h = `<figure class="visual" data-vid="${esc(vid)}">
      <figcaption class="v-title"><span>${mdInline(v.title)}</span><button class="btn ghost v-expand" data-action="visual-expand" aria-label="Развернуть схему на весь экран">⤢ Развернуть</button><button class="btn ghost v-close" data-action="visual-close" aria-label="Закрыть">✕ Закрыть</button></figcaption>
      <div class="v-canvas" data-vid="${esc(vid)}" aria-label="${esc(v.title)}"><div class="v-loading">Рисую схему…</div></div>`;
    if (steps) {
      h += `<div class="v-steps" aria-live="polite">
        <div class="v-step-text"><span class="v-step-n">Шаг ${k} из ${n}</span>${mdInline(steps[k - 1])}</div>
        <div class="v-step-bar" aria-hidden="true">${steps.map((_, i) => `<span class="${i < k ? "on" : ""}"></span>`).join("")}</div>
        <div class="actions">
          <button class="btn ghost" data-action="visual-step" data-vid="${esc(vid)}" data-dir="-1" ${k <= 1 ? "disabled" : ""}>← Назад</button>
          ${k < n ? `<button class="btn primary" data-action="visual-step" data-vid="${esc(vid)}" data-dir="1">Дальше →</button>
          <button class="btn ghost" data-action="visual-step" data-vid="${esc(vid)}" data-dir="all">Показать целиком</button>`
          : `<button class="btn ghost" data-action="visual-step" data-vid="${esc(vid)}" data-dir="reset">Сначала</button>`}
        </div></div>`;
    }
    if (v.caption) h += `<div class="v-caption">${mdInline(v.caption)}</div>`;
    return h + `</figure>`;
  },
};
