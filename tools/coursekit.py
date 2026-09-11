"""Сборка и валидация курса из content/ (см. docs/content-guide.md)."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"

SCHEMA_VERSIONS = {"1.0", "1.1"}
LEVELS = {"L1", "L2", "L3", "L4", "L5", "L6"}
QUESTION_TYPES = {"short_answer", "multiple_choice", "explain", "predict", "debug", "design", "decision"}
PRACTICE_TYPES = {"code", "debug", "design", "analysis", "prediction"}
RELATION_TYPES = {"requires", "prerequisite", "related", "contrasts_with", "alternative_to", "part_of", "extends", "causes", "solves"}
RELATED_TYPES = {"prerequisite", "related", "alternative", "next"}
MENTAL_MODEL_TYPES = {"diagram", "timeline", "state_machine", "data_flow", "sequence", "memory_layout", "layered_model", "tree", "table", "formula", "none"}
IMPORTANCE = {"critical", "important", "secondary"}
CLAIM_STATUSES = {"confirmed", "uncertain", "potentially_outdated", "disputed"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

CONCEPT_FIELDS = [
    "id", "title", "domain", "level", "tags", "prerequisites", "summary", "mental_model", "problem",
    "mechanism", "minimal_example", "details", "invariants", "failure_modes", "tradeoffs", "usage",
    "comparison", "claims", "retrieval", "worked_examples", "practice", "related_concepts",
]
OPTIONAL_CONCEPT_FIELDS = {"origin", "story", "short_answer"}
ANSWER_LEVELS = ("junior", "middle", "senior")
QUESTION_FIELDS = ["id", "type", "level", "question", "context", "expected_answer", "key_points",
                   "common_mistakes", "hints", "difficulty", "tags"]
OPTIONAL_QUESTION_FIELDS = {"code", "code_language", "follow_up", "priority", "key_question", "origin", "options"}
# Поля, которые означают пользовательский runtime state и запрещены в контенте.
USER_STATE_FIELDS = {"user_progress", "recall_score", "last_review", "next_review", "attempts", "mastered", "streak"}


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_registry():
    return load_json(CONTENT / "registry.json")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")

    def print(self):
        for w in self.warnings:
            print(f"  warn  {w}")
        for e in self.errors:
            print(f"  ERROR {e}")
        print(f"{len(self.errors)} errors, {len(self.warnings)} warnings")


def _check_origin(obj, where, rep):
    if "origin" in obj and obj["origin"] != "extra":
        rep.error(where, f'origin должен быть "extra" или отсутствовать, а не {obj["origin"]!r}')


def _check_str_list(value, where, rep):
    if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
        rep.error(where, "ожидается список строк")


def _scan_user_state(obj, where, rep):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in USER_STATE_FIELDS:
                rep.error(where, f"поле runtime state {k!r} не должно быть в контенте")
            _scan_user_state(v, where, rep)
    elif isinstance(obj, list):
        for v in obj:
            _scan_user_state(v, where, rep)


MERMAID_KINDS = ("sequencediagram", "flowchart", "graph", "statediagram-v2", "statediagram", "classdiagram",
                 "erdiagram", "timeline", "mindmap", "block-beta", "packet-beta", "gantt", "pie", "xychart-beta")
SEQ_BLOCK_OPEN = re.compile(r"^(loop|alt|opt|par|rect|critical|break)\b", re.I)
SEQ_STEP = re.compile(r"^(note\s|[^%:]+?(<<)?-{1,2}(>>|>|x|\))[+-]?[^:]*:)", re.I)


def mermaid_kind(src):
    first = next((l.strip() for l in src.split("\n") if l.strip() and not l.strip().startswith("%%")), "")
    return first.split()[0].lower() if first else ""


def mermaid_step_count(src):
    return sum(1 for l in src.split("\n")[1:] if SEQ_STEP.match(l.strip()))


def validate_visuals(vis, where, rep):
    if not isinstance(vis, dict):
        rep.error(where, "short_answer.visuals должен быть {junior|middle|senior: [...]}")
        return
    for lvl, items in vis.items():
        if lvl not in ANSWER_LEVELS:
            rep.error(where, f"visuals: неизвестный уровень {lvl!r}")
            continue
        if not isinstance(items, list):
            rep.error(where, f"visuals.{lvl} должен быть списком")
            continue
        for i, v in enumerate(items):
            w = f"{where} visuals.{lvl}[{i}]"
            for f in v:
                if f not in ("title", "mermaid", "caption", "steps", "origin"):
                    rep.error(w, f"лишнее поле {f!r}")
            if not v.get("title") or not isinstance(v.get("mermaid"), str):
                rep.error(w, "нужны title и mermaid")
                continue
            kind = mermaid_kind(v["mermaid"])
            if kind not in MERMAID_KINDS:
                rep.error(w, f"неизвестный тип диаграммы Mermaid {kind!r}")
            if v.get("steps") is not None:
                if kind != "sequencediagram":
                    rep.error(w, "steps поддерживаются только для sequenceDiagram")
                elif not isinstance(v["steps"], list) or not all(isinstance(x, str) for x in v["steps"]):
                    rep.error(w, "steps — список строк")
                else:
                    n = mermaid_step_count(v["mermaid"])
                    if len(v["steps"]) != n:
                        rep.error(w, f"steps: {len(v['steps'])} подписей, а сообщений/заметок в диаграмме {n}")
            _check_origin(v, w, rep)


def validate_concept(c, known_ids, reg_entry, rep):
    cid = c.get("id", "<no id>")
    w = f"concept {cid}"
    for f in CONCEPT_FIELDS:
        if f not in c:
            rep.error(w, f"нет обязательного поля {f!r}")
    for f in c:
        if f not in CONCEPT_FIELDS and f not in OPTIONAL_CONCEPT_FIELDS:
            rep.error(w, f"лишнее поле {f!r}")
    _check_origin(c, w, rep)
    if not ID_RE.match(cid):
        rep.error(w, "id должен быть ascii kebab-case")
    if c.get("level") not in LEVELS:
        rep.error(w, f"недопустимый level {c.get('level')!r}")
    if reg_entry:
        for f in ("title", "domain", "level"):
            if c.get(f) != reg_entry.get(f):
                rep.warn(w, f"{f} отличается от registry: {c.get(f)!r} != {reg_entry.get(f)!r}")
        if sorted(c.get("prerequisites", [])) != sorted(reg_entry.get("prerequisites", [])):
            rep.error(w, f"prerequisites не совпадают с registry: {c.get('prerequisites')} vs {reg_entry.get('prerequisites')}")
    for p in c.get("prerequisites", []):
        if p not in known_ids:
            rep.error(w, f"prerequisite {p!r} не существует")
    if not isinstance(c.get("summary"), str) or not c.get("summary", "").strip():
        rep.error(w, "пустой summary")

    mm = c.get("mental_model") or {}
    if mm.get("type") not in MENTAL_MODEL_TYPES:
        rep.error(w, f"mental_model.type {mm.get('type')!r} недопустим")
    for f in ("description", "elements", "relations"):
        if f not in mm:
            rep.error(w, f"mental_model без поля {f!r}")
    for f in ("elements", "relations"):
        if f in mm:
            _check_str_list(mm[f], f"{w} mental_model.{f}", rep)
    for f in mm:
        if f not in ("type", "description", "elements", "relations", "diagram", "table"):
            rep.error(w, f"mental_model: лишнее поле {f!r}")
    if mm.get("table"):
        t = mm["table"]
        if not isinstance(t, dict) or not isinstance(t.get("columns"), list) or not isinstance(t.get("rows"), list):
            rep.error(w, "mental_model.table должен быть {columns: [], rows: [[]]}")
        else:
            for i, row in enumerate(t["rows"]):
                if len(row) != len(t["columns"]):
                    rep.error(w, f"mental_model.table.rows[{i}]: {len(row)} ячеек при {len(t['columns'])} колонках")
    if mm.get("diagram"):
        width = max(len(line) for line in mm["diagram"].split("\n"))
        if width > 64:
            rep.warn(w, f"mental_model.diagram шириной {width} символов (рекомендуется ≤ 56)")

    story = c.get("story")
    if story is not None:
        if not isinstance(story, dict) or not isinstance(story.get("beats"), list) or not story["beats"]:
            rep.error(w, "story должен быть {intro, beats: [...], outro}")
        else:
            for f in story:
                if f not in ("intro", "beats", "outro", "origin"):
                    rep.error(w, f"story: лишнее поле {f!r}")
            _check_origin(story, f"{w} story", rep)
            for i, b in enumerate(story["beats"]):
                if not b.get("problem") or not b.get("solution"):
                    rep.error(w, f"story.beats[{i}] требует problem и solution")
                for f in b:
                    if f not in ("problem", "solution", "term", "analogy", "origin"):
                        rep.error(w, f"story.beats[{i}]: лишнее поле {f!r}")
                _check_origin(b, f"{w} story.beats[{i}]", rep)

    sa = c.get("short_answer")
    if sa is not None:
        if not isinstance(sa, dict) or any(not isinstance(sa.get(k), str) or not sa.get(k).strip() for k in ANSWER_LEVELS):
            rep.error(w, "short_answer требует непустые junior, middle, senior")
        else:
            for f in sa:
                if f not in ANSWER_LEVELS and f != "visuals":
                    rep.error(w, f"short_answer: лишнее поле {f!r}")
            if "visuals" in sa:
                validate_visuals(sa["visuals"], w, rep)

    pr = c.get("problem") or {}
    for f in ("question", "context", "why_it_matters"):
        if f not in pr:
            rep.error(w, f"problem без поля {f!r}")

    mech = c.get("mechanism") or {}
    for f in ("steps", "key_objects", "important_distinctions"):
        if f not in mech:
            rep.error(w, f"mechanism без поля {f!r}")
    for i, s in enumerate(mech.get("steps", [])):
        for f in ("order", "title", "description"):
            if f not in s:
                rep.error(w, f"mechanism.steps[{i}] без {f!r}")
        _check_origin(s, f"{w} mechanism.steps[{i}]", rep)

    ex = c.get("minimal_example") or {}
    for f in ("language", "code", "explanation", "expected_result"):
        if f not in ex:
            rep.error(w, f"minimal_example без поля {f!r}")

    for i, d in enumerate(c.get("details", [])):
        if d.get("importance") not in IMPORTANCE:
            rep.error(w, f"details[{i}].importance недопустим")
        _check_origin(d, f"{w} details[{i}]", rep)
    for i, inv in enumerate(c.get("invariants", [])):
        if "statement" not in inv or "why" not in inv:
            rep.error(w, f"invariants[{i}] требует statement и why")
        _check_origin(inv, f"{w} invariants[{i}]", rep)

    ids = []
    for i, fm in enumerate(c.get("failure_modes", [])):
        for f in ("id", "title", "cause", "symptom", "mechanism", "fix", "prevention"):
            if f not in fm:
                rep.error(w, f"failure_modes[{i}] без {f!r}")
        ids.append(fm.get("id"))
        _check_origin(fm, f"{w} failure_modes[{i}]", rep)

    to = c.get("tradeoffs") or {}
    for f in ("benefits", "costs", "risks", "when_tradeoff_matters"):
        if f not in to:
            rep.error(w, f"tradeoffs без {f!r}")
    us = c.get("usage") or {}
    for f in ("use_when", "avoid_when", "signals", "production_considerations"):
        if f not in us:
            rep.error(w, f"usage без {f!r}")

    for i, cmp_ in enumerate(c.get("comparison", [])):
        if cmp_.get("concept_id") not in known_ids:
            rep.error(w, f"comparison[{i}].concept_id {cmp_.get('concept_id')!r} не существует")
        for f in ("dimension", "difference", "why_it_matters"):
            if f not in cmp_:
                rep.error(w, f"comparison[{i}] без {f!r}")
        _check_origin(cmp_, f"{w} comparison[{i}]", rep)

    for i, cl in enumerate(c.get("claims", [])):
        if cl.get("status") not in CLAIM_STATUSES:
            rep.error(w, f"claims[{i}].status недопустим")
        ids.append(cl.get("id"))

    levels = {}
    for i, q in enumerate(c.get("retrieval", [])):
        qw = f"{w} retrieval[{i}] {q.get('id')}"
        ids.append(q.get("id"))
        for f in QUESTION_FIELDS:
            if f not in q:
                rep.error(qw, f"нет поля {f!r}")
        for f in q:
            if f not in QUESTION_FIELDS and f not in OPTIONAL_QUESTION_FIELDS:
                rep.error(qw, f"лишнее поле {f!r}")
        if not str(q.get("id", "")).startswith(cid + "-"):
            rep.error(qw, f"id вопроса должен начинаться с '{cid}-'")
        if q.get("type") not in QUESTION_TYPES:
            rep.error(qw, f"type {q.get('type')!r} недопустим")
        if q.get("level") not in LEVELS:
            rep.error(qw, f"level {q.get('level')!r} недопустим")
        if not isinstance(q.get("difficulty"), int) or not 1 <= q.get("difficulty", 0) <= 5:
            rep.error(qw, "difficulty должен быть int 1–5")
        if q.get("priority") is not None and q.get("priority") not in IMPORTANCE:
            rep.error(qw, "priority недопустим")
        if q.get("type") == "multiple_choice":
            opts = q.get("options") or []
            if len(opts) < 2 or sum(1 for o in opts if o.get("correct")) < 1:
                rep.error(qw, "multiple_choice требует ≥2 options и ≥1 correct")
        elif "options" in q:
            rep.error(qw, "options допустимы только у multiple_choice")
        if q.get("type") in ("predict", "debug") and not (q.get("code") or q.get("context")):
            rep.warn(qw, f"{q.get('type')} без code/context")
        if not q.get("key_points"):
            rep.warn(qw, "нет key_points")
        _check_origin(q, qw, rep)
        levels[q.get("level")] = levels.get(q.get("level"), 0) + 1
    n = len(c.get("retrieval", []))
    if n < 4:
        rep.warn(w, f"всего {n} retrieval-вопросов (обычно 5–9)")
    if n and levels.get("L1", 0) == n:
        rep.error(w, "все вопросы уровня L1")
    mc = sum(1 for q in c.get("retrieval", []) if q.get("type") == "multiple_choice")
    if mc > 1:
        rep.warn(w, f"{mc} multiple_choice вопросов (рекомендуется ≤ 1)")

    for i, we in enumerate(c.get("worked_examples", [])):
        for f in ("id", "title", "problem", "context", "solution", "why_it_works", "alternatives", "tradeoffs", "common_mistakes"):
            if f not in we:
                rep.error(w, f"worked_examples[{i}] без {f!r}")
        sol = we.get("solution") or {}
        if "steps" not in sol or "code" not in sol:
            rep.error(w, f"worked_examples[{i}].solution требует steps и code")
        ids.append(we.get("id"))
        _check_origin(we, f"{w} worked_examples[{i}]", rep)
    for i, p in enumerate(c.get("practice", [])):
        for f in ("id", "type", "title", "task", "constraints", "expected_output", "solution", "evaluation_points", "difficulty"):
            if f not in p:
                rep.error(w, f"practice[{i}] без {f!r}")
        if p.get("type") not in PRACTICE_TYPES:
            rep.error(w, f"practice[{i}].type {p.get('type')!r} недопустим")
        if not isinstance(p.get("difficulty"), int) or not 1 <= p.get("difficulty", 0) <= 5:
            rep.error(w, f"practice[{i}].difficulty должен быть int 1–5")
        ids.append(p.get("id"))
        _check_origin(p, f"{w} practice[{i}]", rep)
    for i, r in enumerate(c.get("related_concepts", [])):
        if r.get("concept_id") not in known_ids:
            rep.error(w, f"related_concepts[{i}].concept_id {r.get('concept_id')!r} не существует")
        if r.get("relation") not in RELATED_TYPES:
            rep.error(w, f"related_concepts[{i}].relation {r.get('relation')!r} недопустим")
        if r.get("concept_id") == cid:
            rep.error(w, "related_concepts ссылается сам на себя")

    for x in ids:
        if not x or not ID_RE.match(str(x)):
            rep.error(w, f"недопустимый id {x!r}")
    _scan_user_state({k: v for k, v in c.items()}, w, rep)
    return ids


def find_cycle(edges):
    """edges: dict node -> set(nodes, которые должны идти раньше). Возвращает цикл или None."""
    state = {}
    stack = []

    def dfs(n):
        state[n] = 1
        stack.append(n)
        for m in edges.get(n, ()):
            if state.get(m) == 1:
                return stack[stack.index(m):] + [m]
            if state.get(m) is None:
                cyc = dfs(m)
                if cyc:
                    return cyc
        stack.pop()
        state[n] = 2
        return None

    for n in list(edges):
        if state.get(n) is None:
            cyc = dfs(n)
            if cyc:
                return cyc
    return None


def load_concepts(ids, rep):
    concepts = []
    for cid in ids:
        path = CONTENT / "concepts" / f"{cid}.json"
        if not path.exists():
            rep.error(f"concept {cid}", f"нет файла {path.relative_to(ROOT)}")
            continue
        try:
            concepts.append(load_json(path))
        except json.JSONDecodeError as e:
            rep.error(f"concept {cid}", f"невалидный JSON: {e}")
    return concepts


def load_map(fragment, rep):
    path = CONTENT / "map" / f"{fragment}.json"
    if not path.exists():
        rep.warn(f"map {fragment}", f"нет файла {path.relative_to(ROOT)}")
        return {"relations": [], "practice_sets": []}
    try:
        data = load_json(path)
    except json.JSONDecodeError as e:
        rep.error(f"map {fragment}", f"невалидный JSON: {e}")
        return {"relations": [], "practice_sets": []}
    for f in data:
        if f not in ("relations", "practice_sets"):
            rep.error(f"map {fragment}", f"лишнее поле {f!r}")
    return data


def load_glossary(fragment, rep):
    path = CONTENT / "glossary" / f"{fragment}.json"
    if not path.exists():
        return []
    try:
        data = load_json(path)
    except json.JSONDecodeError as e:
        rep.error(f"glossary {fragment}", f"невалидный JSON: {e}")
        return []
    return data.get("terms", [])


def validate_glossary(terms, known_ids, where, rep):
    for i, t in enumerate(terms):
        w = f"{where}.terms[{i}] {t.get('term')!r}"
        for f in t:
            if f not in ("term", "aliases", "definition", "concept_id", "scope"):
                rep.error(w, f"лишнее поле {f!r}")
        if not isinstance(t.get("term"), str) or not t["term"].strip():
            rep.error(w, "пустой term")
        if not isinstance(t.get("definition"), str) or not t["definition"].strip():
            rep.error(w, "пустой definition")
        if not isinstance(t.get("aliases", []), list):
            rep.error(w, "aliases должен быть списком строк")
        if not isinstance(t.get("scope", []), list):
            rep.error(w, "scope должен быть списком доменов верхнего уровня")
        if t.get("concept_id") is not None and t["concept_id"] not in known_ids:
            rep.error(w, f"concept_id {t['concept_id']!r} не существует")


def validate_relations(relations, known_ids, where, rep):
    for i, r in enumerate(relations):
        for f in ("from", "to"):
            if r.get(f) not in known_ids:
                rep.error(f"{where}.relations[{i}]", f"{f}={r.get(f)!r} не существует")
        if r.get("type") not in RELATION_TYPES:
            rep.error(f"{where}.relations[{i}]", f"type {r.get('type')!r} недопустим")


def validate_practice_sets(sets, concept_by_id, where, rep):
    practice_ids = {p["id"] for c in concept_by_id.values() for p in c.get("practice", []) if "id" in p}
    question_ids = {q["id"] for c in concept_by_id.values() for q in c.get("retrieval", []) if "id" in q}
    for i, ps in enumerate(sets):
        w = f"{where}.practice_sets[{i}] {ps.get('id')}"
        for f in ("id", "title", "description", "concept_ids", "practice_ids"):
            if f not in ps:
                rep.error(w, f"нет поля {f!r}")
        for cid in ps.get("concept_ids", []):
            if cid not in concept_by_id:
                rep.error(w, f"concept_id {cid!r} не существует")
        for pid in ps.get("practice_ids", []):
            if pid not in practice_ids:
                rep.error(w, f"practice_id {pid!r} не существует")
        for qid in ps.get("question_ids", []):
            if qid not in question_ids:
                rep.error(w, f"question_id {qid!r} не существует")


def build_course(rep):
    """Собирает course dict из content/. Ошибки пишет в rep."""
    registry = load_registry()
    meta = load_json(CONTENT / "meta.json")
    reg_by_id = {e["id"]: e for e in registry["concepts"]}
    known_ids = set(reg_by_id)
    if len(known_ids) != len(registry["concepts"]):
        rep.error("registry", "дубликаты id")

    concepts = load_concepts([e["id"] for e in sorted(registry["concepts"], key=lambda e: e["order"])], rep)
    concept_by_id = {c.get("id"): c for c in concepts}
    all_ids = {}
    for c in concepts:
        for x in validate_concept(c, known_ids, reg_by_id.get(c.get("id")), rep):
            if x in all_ids:
                rep.error(f"concept {c.get('id')}", f"id {x!r} уже используется в {all_ids[x]}")
            all_ids[x] = c.get("id")

    relations = []
    seen = set()
    for c in concepts:
        for p in c.get("prerequisites", []):
            key = (p, c["id"], "requires")
            if key not in seen:
                seen.add(key)
                relations.append({"from": p, "to": c["id"], "type": "requires"})
    practice_sets = []
    glossary = []
    seen_terms = {}
    for fragment in registry["fragments"]:
        terms = load_glossary(fragment, rep)
        validate_glossary(terms, known_ids, f"glossary {fragment}", rep)
        for t in terms:
            key = str(t.get("term", "")).lower()
            if key in seen_terms:
                rep.warn(f"glossary {fragment}", f"термин {t.get('term')!r} уже определён в {seen_terms[key]} — пропущен")
                continue
            seen_terms[key] = fragment
            glossary.append(t)
        m = load_map(fragment, rep)
        validate_relations(m.get("relations", []), known_ids, f"map {fragment}", rep)
        for r in m.get("relations", []):
            if r.get("type") in ("requires", "prerequisite"):
                rep.error(f"map {fragment}", "requires/prerequisite задаются через concept.prerequisites")
            key = (r.get("from"), r.get("to"), r.get("type"))
            if key not in seen:
                seen.add(key)
                relations.append(r)
        validate_practice_sets(m.get("practice_sets", []), concept_by_id, f"map {fragment}", rep)
        practice_sets.extend(m.get("practice_sets", []))

    edges = {cid: set(concept_by_id.get(cid, {}).get("prerequisites", [])) for cid in known_ids}
    cyc = find_cycle(edges)
    if cyc:
        rep.error("knowledge_map", "циклические prerequisites: " + " → ".join(cyc))

    nodes = [{"concept_id": e["id"], "parent_id": e.get("parent_id"), "order": e["order"]}
             for e in sorted(registry["concepts"], key=lambda e: e["order"])]
    for n in nodes:
        if n["parent_id"] is not None and n["parent_id"] not in known_ids:
            rep.error("registry", f"parent_id {n['parent_id']!r} не существует")

    question_ids = {q["id"] for c in concepts for q in c.get("retrieval", [])}
    for i, ex in enumerate(meta.get("exam_sets", [])):
        for qid in ex.get("question_ids", []):
            if qid not in question_ids:
                rep.error(f"exam_sets[{i}] {ex.get('id')}", f"question_id {qid!r} не существует")

    if meta.get("schema_version") not in SCHEMA_VERSIONS:
        rep.error("meta", f"schema_version {meta.get('schema_version')!r} не поддерживается")

    return {
        "schema_version": meta["schema_version"],
        "course": meta["course"],
        "knowledge_map": {"nodes": nodes, "relations": relations},
        "concepts": concepts,
        "practice_sets": practice_sets,
        "exam_sets": meta.get("exam_sets", []),
        "glossary": glossary,
    }
