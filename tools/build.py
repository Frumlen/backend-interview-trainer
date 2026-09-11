"""Сборка: content/ → course.json → index.html (самодостаточный, открывается двойным кликом).

python3 tools/build.py            собрать; при ошибках валидации — exit 1, файлы не пишутся
python3 tools/build.py --force    записать файлы даже при ошибках валидации
python3 tools/build.py --check    только валидация, без записи
"""

import json
import re
import sys

from coursekit import ROOT, Report, build_course

APP = ROOT / "app"


def build_html(course):
    template = (APP / "index.template.html").read_text(encoding="utf-8")
    styles = (APP / "styles.css").read_text(encoding="utf-8")
    js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((APP / "js").glob("*.js")))
    # JSON внутри <script>: экранируем "</" чтобы данные не закрыли тег
    course_json = json.dumps(course, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    vendor = APP / "vendor"
    vendor_css = (vendor / "nunito.css").read_text(encoding="utf-8") if (vendor / "nunito.css").exists() else ""
    vendor_js = (vendor / "mermaid.min.js").read_text(encoding="utf-8") if (vendor / "mermaid.min.js").exists() else ""
    parts = {
        "VENDOR_CSS": vendor_css,
        "VENDOR_JS": vendor_js.replace("</script", "<\\/script"),
        "STYLES": styles,
        "APP_JS": js.replace("</script", "<\\/script"),
        "COURSE_JSON": course_json,
    }
    # Один проход: вставленный текст повторно не сканируется (в JS есть строка "{{COURSE_JSON}}")
    return re.sub(r"\{\{(VENDOR_CSS|VENDOR_JS|STYLES|APP_JS|COURSE_JSON)\}\}", lambda m: parts[m.group(1)], template)


def main():
    force = "--force" in sys.argv
    check_only = "--check" in sys.argv
    rep = Report()
    course = build_course(rep)
    rep.print()
    n_q = sum(len(c.get("retrieval", [])) for c in course["concepts"])
    n_chk = sum(1 for c in course["concepts"] for q in c.get("retrieval", []) if q.get("key_question"))
    n_p = sum(len(c.get("practice", [])) for c in course["concepts"])
    n_w = sum(len(c.get("worked_examples", [])) for c in course["concepts"])
    print(f"concepts {len(course['concepts'])}, questions {n_q} (ключевых {n_chk}), practice {n_p}, "
          f"worked {n_w}, relations {len(course['knowledge_map']['relations'])}, "
          f"practice_sets {len(course['practice_sets'])}, exam_sets {len(course['exam_sets'])}")
    if check_only:
        sys.exit(1 if rep.errors else 0)
    if rep.errors and not force:
        print("Сборка остановлена из-за ошибок (используй --force, чтобы записать всё равно).")
        sys.exit(1)
    (ROOT / "course.json").write_text(json.dumps(course, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    html = build_html(course)
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"written course.json, index.html ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
