"""Проверка одной группы концептов: python3 tools/check_fragment.py 07-go-slice"""

import sys

from coursekit import (Report, load_concepts, load_glossary, load_map, load_registry, validate_concept,
                       validate_glossary, validate_practice_sets, validate_relations)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    fragment = sys.argv[1]
    registry = load_registry()
    if fragment not in registry["fragments"]:
        print(f"Нет группы {fragment!r}. Есть: {', '.join(registry['fragments'])}")
        sys.exit(2)
    reg_by_id = {e["id"]: e for e in registry["concepts"]}
    known_ids = set(reg_by_id)
    rep = Report()
    concepts = load_concepts(registry["fragments"][fragment], rep)
    seen = {}
    for c in concepts:
        for x in validate_concept(c, known_ids, reg_by_id.get(c.get("id")), rep):
            if x in seen:
                rep.error(f"concept {c.get('id')}", f"id {x!r} уже используется в {seen[x]}")
            seen[x] = c.get("id")
        n = len(c.get("retrieval", []))
        levels = sorted({q.get("level") for q in c.get("retrieval", [])})
        chk = sum(1 for q in c.get("retrieval", []) if q.get("key_question"))
        print(f"  {c.get('id')}: {n} вопросов {levels}, ключевых {chk}, "
              f"worked {len(c.get('worked_examples', []))}, practice {len(c.get('practice', []))}")
    m = load_map(fragment, rep)
    validate_relations(m.get("relations", []), known_ids, f"map {fragment}", rep)
    validate_practice_sets(m.get("practice_sets", []), {c.get("id"): c for c in concepts}, f"map {fragment}", rep)
    terms = load_glossary(fragment, rep)
    validate_glossary(terms, known_ids, f"glossary {fragment}", rep)
    print(f"  glossary: {len(terms)} терминов")
    missing = [c.get("id") for c in concepts if not c.get("story") or not c.get("short_answer")]
    if missing:
        rep.warn(f"group {fragment}", f"нет story/short_answer у: {', '.join(missing)}")
    rep.print()
    sys.exit(1 if rep.errors else 0)


if __name__ == "__main__":
    main()
