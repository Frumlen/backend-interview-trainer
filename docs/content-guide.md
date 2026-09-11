# Как писать материал для тренажёра

Этот файл — главная инструкция для автора, в том числе для ИИ-ассистента. Прочитай его целиком, прежде чем добавлять или менять контент. Новый материал должен выглядеть так же, как существующий: сверяйся с образцами из раздела «Образцы».

## Как всё устроено

```
content/
  registry.json               карта курса: список концептов и групп (fragments)
  meta.json                   название курса, готовые экзамены (exam_sets)
  concepts/<id>.json          один концепт = одна тема (схема ниже)
  map/<группа>.json           связи между концептами и наборы практики группы
  glossary/<группа>.json      термины для всплывающих подсказок
app/                          интерфейс: шаблон, стили, JS (для нового материала трогать не нужно)
tools/build.py                сборка content/ → index.html (+ course.json) с полной валидацией
tools/check_fragment.py       быстрая проверка одной группы
tools/check_visuals.js        проверка отрисовки схем Mermaid в headless Chrome
index.html                    результат сборки: самодостаточная страница, её раздаёт GitHub Pages
```

`index.html` руками не правь — только пересобирай. Интерфейс работает с любым валидным курсом: id конкретных концептов в JS не зашиты, поэтому новый материал добавляется только файлами в `content/`.

## Образцы

| Что | Файл |
|---|---|
| Эталон подачи (`story`, `short_answer`, глоссарий) | `content/concepts/tcp.json`, `content/concepts/udp.json` |
| Схемы Mermaid, в том числе пошаговые | `content/concepts/tcp.json`, `content/concepts/go-slice-append.json`, `content/concepts/go-slice-in-function.json` |
| Код в вопросах (`predict` / `debug`) | `content/concepts/go-slice-*.json` |
| System design | `content/concepts/system-design-approach.json`, `content/concepts/sd-messenger.json` |
| Группа целиком: map + glossary | `content/map/07-go-slice.json`, `content/glossary/07-go-slice.json` |

Перед тем как писать новый концепт, открой один-два образца той же природы и повтори их структуру, объём и тон.

## Добавить новую тему: порядок действий

1. **Реши, в какую группу она попадает.** Группы перечислены в `registry.json → fragments` (`"07-go-slice": ["go-array", "go-slice", …]`). Для нового раздела заведи новую группу: ключ вида `NN-kebab-name`, пустые `map/NN-….json` (`{"relations": [], "practice_sets": []}`) и `glossary/NN-….json` (`{"terms": []}`).
2. **Добавь запись в `registry.json → concepts`:**
   ```jsonc
   {"id": "go-map", "title": "Map", "domain": "Go / Map", "level": "L3",
    "order": 745, "parent_id": null, "prerequisites": ["hash-map"]}
   ```
   - `id` — ascii kebab-case, уникальный; имя файла — `concepts/<id>.json`.
   - `domain` — раздел сайдбара; `" / "` даёт вложенность (`"Go / Slice"`). Используй существующие домены, если тема к ним подходит.
   - `order` — позиция в курсе (сортировка по возрастанию); оставляй зазоры, чтобы потом вставлять темы между.
   - `prerequisites` — что нужно знать до этой темы; из них строятся связи `requires` на карте. Циклы запрещены.
   - Добавь `id` в список своей группы в `fragments`.
3. **Напиши `concepts/<id>.json`** по схеме ниже. `id`, `title`, `domain`, `level`, `prerequisites` — те же, что в registry.
4. **Добавь термины** в `glossary/<группа>.json` и связи с другими темами в `map/<группа>.json`.
5. **Если нужно, добавь вопросы в экзамен** (`meta.json → exam_sets[].question_ids`) и практику в набор группы (`map → practice_sets`).
6. **Проверь и собери** (раздел «Проверка»), закоммить вместе с пересобранным `index.html`.

## Язык и стиль

- Текст на русском, технические термины — на английском, как их говорят на работе: `backing array`, `consumer group`, `offset`, `fan-out`, `MVCC`, `escape analysis`.
- Читатель — backend-разработчик, который готовится к техническому собеседованию. Упор на механизм, trade-offs, failure modes и выбор между альтернативами, а не на определения.
- Проблема раньше определения: сначала ситуация, из-за которой механизм существует, потом сам механизм.
- Коротко: `summary` — 1–4 предложения, `expected_answer` — 2–6 предложений, так, как это стоит сказать на собеседовании.
- Факты — технически точные на текущую версию технологий. Если утверждение зависит от версии (Go, PostgreSQL и т. д.) и нет полной уверенности — не пиши его или вынеси в `claims` со статусом `uncertain`.
- Никаких выдуманных личных историй, цифр «из проекта» и имён компаний. На вопросы вида «Где вы применяли X?» отвечай типичным техническим сценарием: где это обычно нужно, по какому критерию выбирают, какие детали важны.

## Story: главная подача темы

`story` — объяснение цепочкой «проблема → решение → новая проблема». На странице концепта оно идёт первым; решение каждого шага открывается после того, как читатель подумал сам. Именно такая подача, а не «определение + жаргон», делает материал понятным. Эталон — `tcp.json` и `udp.json`.

```jsonc
"story": {
  "intro": "…",                            // сцена: что мы пытаемся сделать и что может пойти не так
  "beats": [
    {"problem": "… **вопрос-беда?**",        // конкретная ситуация, а не определение; сам вопрос выделен жирным
     "solution": "…",                       // как механизм это чинит, простыми словами; можно блок кода
     "term": "sequence number (порядковый номер)", // термин называется ПОСЛЕ того, как в нём появилась нужда; можно null
     "analogy": "…"}                        // необязательная бытовая аналогия
  ],
  "outro": "**Как сказать на интервью:** …" // готовая формулировка ответа
}
```

Правила:
- Начинай со сцены и проблемы, а не с определения. Жаргон — только после объяснения, в `term`.
- 5–10 шагов. Каждое решение порождает следующую проблему: «хорошо, но что если…».
- Бытовые примеры и аналогии, короткие фразы, разговорный тон. Цифры — только как опоры (8 байт, 1500 байт).
- Предпоследний или последний шаг — «чем заплатили» (trade-off), `outro` — формулировка для собеседования в 2–4 предложения.
- Код в `solution` — короткий и с комментариями результата (`// [1 2 3] [100 2 3]`); проверь, что он действительно так работает.

## short_answer: краткий ответ на трёх уровнях

Вкладка «Кратко» рядом с историей. Каждый уровень — самостоятельный ответ на собеседовании, следующий глубже предыдущего.

```jsonc
"short_answer": {
  "junior": "2–3 предложения простыми словами: что это и зачем.",
  "middle": "Суть ответа + как работает + когда это важно. Абзацы через пустую строку.",
  "senior": "Всё из middle, плюс списком:\n- trade-offs\n- failure modes\n- нюансы production и версий",
  "visuals": { … }                       // необязательно, см. ниже
}
```

### short_answer.visuals: схемы Mermaid

Схема показывается под текстом своего уровня и иллюстрирует именно то, что там написано. Добавляй её только там, где картинка реально помогает понять: обычно 1–3 схемы на концепт, чаще на Middle/Senior, иногда простая схема на Junior. Не каждый уровень обязан иметь схему.

```jsonc
"visuals": {
  "middle": [{
    "title": "Установка соединения: three-way handshake",          // обязательно
    "mermaid": "sequenceDiagram\n  participant C as Клиент\n  participant S as Сервер\n  C->>S: SYN, seq = X\n  ...",
    "steps": ["подпись к 1-му сообщению или Note", "…"],          // только для sequenceDiagram: пошаговый режим
    "caption": "Одно предложение — главный вывод схемы."             // или null
  }]
}
```

- Библиотека — Mermaid 11, встроена в `index.html` и работает офлайн. Типы: `sequenceDiagram` (протоколы, запросы, взаимодействие goroutine), `flowchart LR|TD` (процессы, решения, архитектура, раскладка памяти), `stateDiagram-v2` (состояния); реже `block-beta`, `timeline` и др.
- `steps` — ровно по одной подписи на каждое сообщение и каждую `Note`, в порядке появления. В пошаговом режиме стрелки открываются по одной. Пошаговый режим — только там, где есть последовательность событий. Все `participant` объявляй в начале; `box` в пошаговых схемах не используй.
- Синтаксис: в тексте сообщений не ставь `;` и `#`. Id узлов во flowchart — латиницей; подписи со скобками и спецсимволами (`[ ] ( ) : =`) бери в кавычки: `A["s[1:3] len=2 cap=4"]`; перенос строки — `<br/>`. Подписи короткие, до 12 узлов на схему.
- Раскладка памяти (массивы, slice): ячейки — отдельные узлы внутри `subgraph`, связанные невидимой связью `~~~`, стрелка от дескриптора к ячейке. Не соединяй стрелкой два `subgraph` — Mermaid тогда ставит ячейки столбиком; соединяй крайние ячейки. Образцы — `go-array.json`, `go-slice.json`.
- Числа в подписях (len, cap, значения) должны совпадать с кодом из текста концепта.
- Проверка отрисовки обязательна (раздел «Проверка»).

## Концепт: `content/concepts/<id>.json`

Все поля ниже, кроме `story` и `short_answer`, обязательны (пустые списки допустимы). Лишние поля валидатор не пропустит.

```jsonc
{
  "id": "go-slice",
  "title": "Slice",
  "domain": "Go / Slice",
  "level": "L3",                          // L1–L6, см. «Уровни»
  "tags": ["go", "memory"],
  "prerequisites": ["go-array"],
  "summary": "…",                         // итог в 1–4 предложения; показывается после story
  "mental_model": {
    "type": "memory_layout",              // diagram|timeline|state_machine|data_flow|sequence|memory_layout|layered_model|tree|table|formula|none
    "description": "…",
    "elements": ["slice descriptor", "backing array"],
    "relations": ["slice descriptor -> backing array: pointer"],   // "A -> B" или "A -> B: подпись"
    "diagram": "┌─────────┬─────┬─────┐\n│ pointer │ len │ cap │\n└────┬────┴─────┴─────┘\n     ▼\n[10][20][30][40][50]",  // необязательная ASCII-схема
    "table": null                         // необязательно: {"columns": [...], "rows": [[...], ...]}
  },
  "problem": {"question": "…", "context": "…", "why_it_matters": "…"},
  "mechanism": {
    "steps": [{"order": 1, "title": "…", "description": "…"}],
    "key_objects": ["…"],
    "important_distinctions": ["…"]
  },
  "minimal_example": {"language": "go", "code": "…", "explanation": "…", "expected_result": "…"},
  "details": [{"title": "…", "description": "…", "importance": "critical|important|secondary"}],
  "invariants": [{"statement": "…", "why": "…"}],
  "failure_modes": [{"id": "go-slice-fm-retention", "title": "…", "cause": "…", "symptom": "…", "mechanism": "…", "fix": "…", "prevention": "…|null"}],
  "tradeoffs": {"benefits": [], "costs": [], "risks": [], "when_tradeoff_matters": "…"},
  "usage": {"use_when": [], "avoid_when": [], "signals": [], "production_considerations": []},
  "comparison": [{"concept_id": "go-array", "dimension": "…", "difference": "…", "why_it_matters": "…"}],
  "claims": [{"id": "go-slice-claim-01", "statement": "…", "status": "confirmed|uncertain|potentially_outdated|disputed", "notes": "…|null"}],
  "retrieval": [ /* вопросы, см. ниже */ ],
  "worked_examples": [ /* разборы, см. ниже */ ],
  "practice": [ /* задачи, см. ниже */ ],
  "related_concepts": [{"concept_id": "go-slice-append", "relation": "prerequisite|related|alternative|next"}],
  "story": { /* см. выше */ },
  "short_answer": { /* см. выше */ }
}
```

- `mental_model` нужна там, где помогает ответить на вопрос «как мне это представить?». Иначе `{"type": "none", "description": "…", "elements": [], "relations": []}`.
  - `sequence`: `relations` — сообщения по порядку (`"Client -> Server: SYN"`), `elements` — участники.
  - `data_flow` / `timeline` / `state_machine` / `tree` / `layered_model`: `relations` задают граф, интерфейс раскладывает его сверху вниз.
  - `diagram` — моноширинная ASCII-схема шириной до 56 символов, box-drawing символы и стрелки `─│┌┐└┘├┤┬┴┼▼▲→←↓↑`.
  - `table` — для сравнения вариантов (HTTP/1.1 vs 2 vs 3, типы индексов): до 5 колонок, короткие ячейки.
- `claims` — упрощённые, спорные или версионно-зависимые утверждения с пояснением в `notes`: «так часто говорят, но точнее…». Статусы: `confirmed` — верно, но есть нюанс; `uncertain`; `potentially_outdated`; `disputed`.
- `comparison[].concept_id` и `related_concepts[].concept_id` должны существовать в `registry.json`. Если сравнить не с чем, клади сравнение в `details`, `tradeoffs` или в вопрос типа `decision`.
- Id вложенных объектов (`failure_modes`, `claims`, вопросы, разборы, практика) начинаются с `<concept-id>-` и уникальны во всём курсе.

## Уровни

`L1` Recall («что это?»), `L2` Understanding («почему и как работает?»), `L3` Application («как применить?»), `L4` Troubleshooting («почему сломалось?»), `L5` Design («как спроектировать?»), `L6` Expert / Trade-offs («что выбрать и почему?»). `level` концепта — его общий уровень; у каждого вопроса свой.

## Retrieval-вопрос

```jsonc
{
  "id": "go-slice-q-01",                  // <concept-id>-q-NN
  "type": "short_answer",                 // short_answer|multiple_choice|explain|predict|debug|design|decision
  "level": "L1",
  "question": "…",
  "context": "…|null",                    // сценарий, ограничения, варианты A/B/C для decision
  "code": "…|null",                       // необязательно: код для predict/debug
  "code_language": "go|sql|python|text|null",
  "expected_answer": "…",                 // минимальный правильный ответ, как его сказать вслух
  "key_points": ["…"],                    // 2–6 коротких пунктов: читатель отмечает, какие назвал
  "common_mistakes": ["…"],
  "hints": ["…"],                         // 0–2 подсказки без ответа
  "follow_up": "…|null",                  // необязательно: типичное уточнение интервьюера
  "priority": "critical|important|secondary",  // необязательно
  "key_question": true,                   // необязательно: главный вопрос темы, попадает во вкладку «Ключевые вопросы»
  "difficulty": 1,                        // 1–5, не путать с level
  "tags": [],
  "options": [{"id": "a", "text": "…", "correct": true, "explanation": "…"}]  // только для multiple_choice
}
```

- Лестница для значимой темы: 1–2 × L1, 1–2 × L2, 1–2 × L3, 1 × L4 (если есть что ломать), 0–1 × L5, 0–1 × L6. Обычно 5–9 вопросов; все вопросы одного уровня L1 валидатор не пропустит.
- Кроме базовых вопросов добавляй вопросы-углубления, какие задают на собеседовании: «Почему?», «Что будет, если…?», «Как обнаружить?», «Какой trade-off?».
- `multiple_choice` — редко, не больше 1 на концепт. Правдоподобные дистракторы; правильный вариант не выделяется длиной.
- `predict` / `debug` — для кода. Код кладётся в `code`, причину ошибки в условии не раскрывай.
- `decision` — сценарий, ограничения и варианты в `context`; в `expected_answer` — выбор, обоснование и главный trade-off.
- `design` — ограничения в `context`; конкретные цифры нагрузки не выдумывай, если их нет в условии — пусть отвечающий зафиксирует допущения сам.

## Worked example

```jsonc
{
  "id": "go-slice-we-01",
  "title": "…",
  "problem": "…",
  "context": "…|null",
  "solution": {"steps": ["Requirements: …", "Approach: …", "…"], "code": "…|null"},
  "why_it_works": "…",
  "alternatives": ["…"],
  "tradeoffs": ["…"],
  "common_mistakes": ["…"]
}
```

Разбор нужен там, где полезно показать ход решения целиком: system design, диагностика, код, стратегия ответа. Для system design шаги такие: Requirements → Approach → Architecture → Important decisions → Failure modes → Trade-offs → Final solution.

## Practice

```jsonc
{
  "id": "go-slice-pr-01",
  "type": "code|debug|design|analysis|prediction",
  "title": "…",
  "task": "…",
  "constraints": ["…"],
  "expected_output": "…|null",
  "solution": {"description": "…", "code": "…|null"},
  "evaluation_points": ["…"],             // по ним читатель сверяет свой ответ
  "difficulty": 3
}
```

Практика проверяет применение, а не определение: 1–2 задачи на концепт, где это осмысленно.

## map/<группа>.json

```jsonc
{
  "relations": [
    {"from": "tcp", "to": "udp", "type": "contrasts_with"}   // related|contrasts_with|alternative_to|part_of|extends|causes|solves
  ],
  "practice_sets": [
    {"id": "ps-go-slice", "title": "Go Memory: slice", "description": "…",
     "concept_ids": ["go-slice", "go-slice-append"], "practice_ids": ["go-slice-pr-01"], "question_ids": ["go-subslice-q-04"]}
  ]
}
```

- `requires` здесь не пиши: эти связи строятся из `prerequisites`.
- Для `solves`: `from` решает проблему `to` (например, `idempotency solves retry-duplicates`).

## Глоссарий: `glossary/<группа>.json`

```jsonc
{"terms": [
  {"term": "sequence number", "aliases": ["порядковый номер", "seq"],
   "definition": "1–2 простых предложения.", "concept_id": "tcp",   // концепт, где термин объясняется, или null
   "scope": ["Сеть"]}   // необязательно: подсвечивать только в этих доменах верхнего уровня
]}
```

- Первое вхождение термина в каждой карточке подчёркивается; при наведении (или тапе) показывается определение и ссылка на тему.
- Повтор термина в другой группе — предупреждение сборки; побеждает первая группа.
- Окончания русских терминов подбираются автоматически. В `aliases` не клади частые слова («запрос», «окно») — иначе они подсветятся везде.

## meta.json: экзамены

```jsonc
"exam_sets": [
  {"id": "exam-go", "title": "Go: GC, планировщик, slice, конкурентность", "description": "…",
   "question_ids": ["go-slice-q-01", "…"]}
]
```

Экзамен — готовый набор вопросов из разных тем. Новые вопросы добавляй в подходящий набор или заводи новый.

## Мини-разметка в текстовых полях

В длинных текстах (`description`, `expected_answer`, `explanation`, `solution`, `story`, `short_answer` и т. п.) можно использовать: `inline code`, **жирный** (редко), строки-списки с `- `, пустую строку между абзацами и блоки кода ```` ```go … ``` ````. Другой Markdown не используй.

## Проверка

```bash
python3 tools/check_fragment.py 07-go-slice   # быстрая проверка своей группы (имена групп — в registry.json → fragments)
python3 tools/build.py                        # полная валидация + сборка index.html; при ошибках ничего не пишет
python3 tools/build.py --check                # только валидация

# отрисовка схем Mermaid (нужны Node.js и Google Chrome):
npm i --prefix /tmp/pptr puppeteer-core@22
NODE_PATH=/tmp/pptr/node_modules node tools/check_visuals.js go-slice go-slice-append   # id концептов; без аргументов — все
```

Работа считается готовой, когда: `check_fragment.py` и `build.py` — 0 errors, `check_visuals.js` — 0 ошибок, новый `index.html` открыт в браузере и тема выглядит как образцы. Коммить `content/` вместе с пересобранным `index.html`.
