# Фреймворк декомпозиции целей с защитой от «галлюцинаций» ИИ

> Назначение: пользователь задаёт одну измеримую цель → ИИ предлагает разбиение
> на месяцы → недели → дни. На каждом уровне предложение проходит согласование
> с человеком. ИИ оперирует **только** проверяемыми данными; всё, чего нет во
> входных данных, помечается как явное допущение или запрос недостающих данных.

---

## 1. Модели данных

### 1.1. Базовые принципы моделирования

- **Любое число имеет происхождение (`source`).** Значение метрики может быть только одного из трёх типов: `user_input` (дал человек), `derived` (вычислено по явной формуле из других значений) или `assumption` (допущение). Тип `ai_invented` структурно отсутствует — его нельзя записать в модель.
- **Декомпозиция = распределение метрик родителя между детьми.** Месяц не создаёт новые метрики «из воздуха», он берёт долю метрик цели. Сумма долей сверяется с родителем (закон сохранения, см. §3).
- **Неопределённость — это данные, а не пробел.** Недостающие сведения хранятся как объекты `DataGap`, а не замалчиваются.

### 1.2. Ключевые сущности

- **`Goal`** — корневая цель с финальными измеримыми параметрами и ограничениями.
- **`Period`** — обобщённый узел декомпозиции (`MONTH` / `WEEK` / `DAY`); образует дерево.
- **`Metric`** — измеримый параметр со значением, единицей и происхождением.
- **`Assumption`** — явное допущение с указанием, кто должен его подтвердить.
- **`DataGap`** — недостающий измеримый параметр, который требуется от пользователя.
- **`Constraint`** — жёсткое ограничение (бюджет, закон, рынок, зависимость).
- **`ApprovalRecord`** — состояние согласования узла (конечный автомат).
- **`ChangeLogEntry`** — запись аудита (кто/когда/что/почему изменил).

### 1.3. JSON Schema (Draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/goal-decomposition.json",
  "title": "GoalDecompositionDocument",
  "type": "object",
  "required": ["goal", "periods", "changeLog", "schemaVersion"],
  "properties": {
    "schemaVersion": { "type": "string", "const": "1.0.0" },

    "goal": {
      "type": "object",
      "required": ["id", "title", "startDate", "deadline", "targetMetrics", "status"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "title": { "type": "string" },
        "description": { "type": "string" },
        "context": {
          "type": "object",
          "description": "Структурированные факты о среде (регион, отрасль и т.п.)",
          "additionalProperties": { "type": ["string", "number", "boolean"] }
        },
        "startDate": { "type": "string", "format": "date" },
        "deadline": { "type": "string", "format": "date" },
        "targetMetrics": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/Metric" }
        },
        "constraints": { "type": "array", "items": { "$ref": "#/$defs/Constraint" } },
        "assumptions": { "type": "array", "items": { "$ref": "#/$defs/Assumption" } },
        "dataGaps": { "type": "array", "items": { "$ref": "#/$defs/DataGap" } },
        "status": {
          "type": "string",
          "enum": ["draft", "decomposing", "active", "completed", "archived"]
        }
      }
    },

    "periods": {
      "type": "array",
      "items": { "$ref": "#/$defs/Period" }
    },

    "changeLog": {
      "type": "array",
      "items": { "$ref": "#/$defs/ChangeLogEntry" }
    }
  },

  "$defs": {

    "Metric": {
      "type": "object",
      "required": ["id", "name", "unit", "source"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string", "examples": ["Количество нанятых сотрудников"] },
        "unit": { "type": "string", "examples": ["чел.", "₽", "₽/мес", "%", "дней"] },
        "targetValue": { "type": ["number", "null"] },
        "currentValue": { "type": ["number", "null"], "description": "Фактическое значение" },
        "measuredAt": { "type": ["string", "null"], "format": "date-time" },

        "source": {
          "type": "string",
          "enum": ["user_input", "derived", "assumption"],
          "description": "Происхождение значения. 'ai_invented' невозможен по схеме."
        },
        "derivation": {
          "type": ["object", "null"],
          "description": "Обязательно, если source = derived",
          "required": ["formula", "inputs"],
          "properties": {
            "formula": { "type": "string", "examples": ["sum(children.targetValue)"] },
            "inputs": { "type": "array", "items": { "type": "string" } }
          }
        },
        "assumptionRef": {
          "type": ["string", "null"],
          "description": "Ссылка на Assumption.id, если source = assumption"
        },
        "confidence": {
          "type": "string",
          "enum": ["measured", "high", "medium", "low"],
          "description": "measured — есть фактический замер; остальное — степень уверенности оценки"
        },
        "evidence": {
          "type": ["string", "null"],
          "description": "Ссылка на документ/выгрузку/строку входных данных"
        }
      },
      "allOf": [
        {
          "if": { "properties": { "source": { "const": "derived" } } },
          "then": { "required": ["derivation"] }
        },
        {
          "if": { "properties": { "source": { "const": "assumption" } } },
          "then": { "required": ["assumptionRef"] }
        }
      ]
    },

    "Assumption": {
      "type": "object",
      "required": ["id", "statement", "assumedValue", "status"],
      "properties": {
        "id": { "type": "string" },
        "statement": {
          "type": "string",
          "examples": ["Регистрация юрлица занимает 5 рабочих дней"]
        },
        "assumedValue": { "type": ["number", "string"] },
        "unit": { "type": "string" },
        "basis": {
          "type": "string",
          "description": "Откуда взята оценка: аналогия, отраслевой норматив, пусто"
        },
        "needsConfirmationFrom": {
          "type": "string",
          "examples": ["юрист", "финансовый директор", "HR"]
        },
        "impact": {
          "type": "array",
          "description": "Какие узлы/метрики зависят от этого допущения",
          "items": { "type": "string" }
        },
        "status": {
          "type": "string",
          "enum": ["unconfirmed", "confirmed", "rejected"]
        }
      }
    },

    "DataGap": {
      "type": "object",
      "required": ["id", "requiredParameter", "blocksDecomposition"],
      "properties": {
        "id": { "type": "string" },
        "requiredParameter": {
          "type": "string",
          "examples": ["Месячный бюджет на ФОТ"]
        },
        "expectedUnit": { "type": "string", "examples": ["₽/мес"] },
        "whyNeeded": { "type": "string" },
        "suggestedSource": { "type": "string", "examples": ["финмодель", "штатное расписание"] },
        "blocksDecomposition": {
          "type": "boolean",
          "description": "Если true — нельзя предлагать разбиение, пока не заполнено"
        }
      }
    },

    "Constraint": {
      "type": "object",
      "required": ["id", "type", "description"],
      "properties": {
        "id": { "type": "string" },
        "type": {
          "type": "string",
          "enum": ["budget", "legal", "market", "dependency", "capacity", "time"]
        },
        "description": { "type": "string" },
        "value": { "type": ["number", "string", "null"] },
        "unit": { "type": "string" },
        "source": { "type": "string", "enum": ["user_input", "assumption"] },
        "hard": {
          "type": "boolean",
          "description": "true — нарушать нельзя (закон, бюджет); false — желательно"
        }
      }
    },

    "Period": {
      "type": "object",
      "required": ["id", "level", "index", "parentId", "dateRange", "approval"],
      "properties": {
        "id": { "type": "string" },
        "level": { "type": "string", "enum": ["MONTH", "WEEK", "DAY"] },
        "index": { "type": "integer", "minimum": 1 },
        "parentId": {
          "type": ["string", "null"],
          "description": "null для месяцев (родитель — сама цель)"
        },
        "goalId": { "type": "string" },
        "dateRange": {
          "type": "object",
          "required": ["from", "to"],
          "properties": {
            "from": { "type": "string", "format": "date" },
            "to": { "type": "string", "format": "date" }
          }
        },
        "allocatedMetrics": {
          "type": "array",
          "description": "Доли метрик родителя, отнесённые к этому периоду",
          "items": { "$ref": "#/$defs/Metric" }
        },
        "milestones": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["title", "dueDate", "status"],
            "properties": {
              "title": { "type": "string" },
              "dueDate": { "type": "string", "format": "date" },
              "status": { "type": "string", "enum": ["planned", "in_progress", "done", "blocked"] },
              "dependsOn": { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "assumptions": { "type": "array", "items": { "$ref": "#/$defs/Assumption" } },
        "dataGaps": { "type": "array", "items": { "$ref": "#/$defs/DataGap" } },
        "approval": { "$ref": "#/$defs/ApprovalRecord" }
      }
    },

    "ApprovalRecord": {
      "type": "object",
      "required": ["status", "proposedBy"],
      "properties": {
        "status": {
          "type": "string",
          "enum": ["draft", "proposed_by_ai", "under_review",
                   "approved", "rejected", "needs_revision"]
        },
        "proposedBy": { "type": "string", "enum": ["ai", "human"] },
        "reviewedBy": { "type": ["string", "null"] },
        "decidedAt": { "type": ["string", "null"], "format": "date-time" },
        "comment": { "type": ["string", "null"] }
      }
    },

    "ChangeLogEntry": {
      "type": "object",
      "required": ["id", "timestamp", "actor", "entityRef", "action"],
      "properties": {
        "id": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" },
        "actor": {
          "type": "object",
          "required": ["kind", "ref"],
          "properties": {
            "kind": { "type": "string", "enum": ["human", "ai"] },
            "ref": { "type": "string", "examples": ["user:42", "ai:agent@1.0.0"] }
          }
        },
        "entityRef": { "type": "string", "examples": ["period:month-1", "metric:headcount"] },
        "action": {
          "type": "string",
          "enum": ["create", "update", "approve", "reject", "recalculate", "confirm_assumption"]
        },
        "field": { "type": ["string", "null"] },
        "oldValue": {},
        "newValue": {},
        "reason": { "type": "string" },
        "triggeredRecalculation": { "type": "boolean" }
      }
    }
  }
}
```

---

## 2. Логика декомпозиции

ИИ-агент работает **слой за слоем сверху вниз** и **не спускается на уровень ниже**, пока текущий уровень не согласован человеком. Каждый проход — это конвейер из шести шагов.

### 2.1. Конвейер декомпозиции одного уровня

1. **Входная валидация (`gatekeeper`).** Проверяет, достаточно ли данных для разбиения. Если ключевой метрики нет — формирует `DataGap` с `blocksDecomposition: true` и **останавливается**, не предлагая чисел.
2. **Сбор ограничений (`constraintResolver`).** Подтягивает бюджет, юридические сроки, зависимости, рыночные условия. Жёсткие ограничения (`hard: true`) становятся неравенствами, которые план обязан удовлетворять.
3. **Построение зависимостей (`dependencyGraph`).** Например: «операционная деятельность невозможна до регистрации юрлица»; «нельзя нанять 10 человек до готовности рабочих мест». Это задаёт допустимый порядок вех.
4. **Распределение метрик (`allocator`).** Метрики родителя раскладываются по дочерним периодам. Кривая распределения — не «ровно поровну», а с учётом зависимостей и ограничений (например, найм идёт волной, выручка нарастает к концу).
5. **Фиксация допущений (`assumptionLedger`).** Любое значение, не выводимое из входных данных, оформляется как `Assumption` с указанием, кто должен подтвердить.
6. **Верификация (`verifier`).** Независимая проверка предложения перед показом человеку (см. §3). Если проверка не пройдена — предложение не публикуется, агент возвращается к шагу 1/4.

### 2.2. Псевдокод агента

```python
def decompose(node, level, dataset):
    # 1. Gatekeeper: хватает ли данных?
    gaps = find_blocking_gaps(node, level, dataset)
    if gaps:
        return Proposal(status="blocked", dataGaps=gaps)  # чисел не предлагаем

    # 2. Ограничения
    constraints = resolve_constraints(node, dataset)

    # 3. Граф зависимостей вех
    deps = build_dependency_graph(node, constraints)

    # 4. Распределение метрик родителя по детям
    children = create_periods(node, level)            # пустые периоды с датами
    for metric in node.metrics:
        # allocate возвращает доли + способ распределения (явная формула)
        allocation = allocate(metric, children, constraints, deps)
        for child, value, rationale in allocation:
            child.add_metric(Metric(
                name=metric.name, unit=metric.unit,
                targetValue=value,
                source="derived",
                derivation={"formula": rationale.formula,
                            "inputs": rationale.inputs},
                confidence=rationale.confidence))

    # 5. Регистрируем допущения вместо выдумывания чисел
    for child in children:
        for unknown in child.unknowns():
            a = Assumption(statement=unknown.text,
                           assumedValue=unknown.estimate,
                           basis=unknown.basis,            # может быть пустым
                           needsConfirmationFrom=unknown.owner,
                           status="unconfirmed")
            child.attach_assumption(a)
            child.metric(unknown.metricId).source = "assumption"
            child.metric(unknown.metricId).assumptionRef = a.id

    # 6. Независимая верификация
    report = verifier.check(node, children)
    if not report.ok:
        return repair_or_block(node, children, report)

    return Proposal(status="proposed_by_ai",
                    children=children,
                    assumptions=collect_assumptions(children),
                    dataGaps=collect_nonblocking_gaps(children))
```

### 2.3. Функция распределения (пример контракта)

```python
def allocate(metric, children, constraints, deps):
    """
    Возвращает список (child, value, rationale).
    Правила:
      - Σ value по детям РАВНА metric.targetValue (или явно отражает буфер).
      - value не нарушает hard-ограничений (бюджет, право, мощность).
      - Если для распределения нет основания в данных -> не угадываем форму
        кривой, а помечаем способ распределения как assumption и просим
        подтвердить (например, профиль набора персонала).
      - rationale.formula всегда заполнена и человекочитаема.
    """
```

---

## 3. Анти-обман механизмы

Защита реализуется не «просьбой к модели не врать», а **структурными инвариантами и независимым валидатором**, который запускается на каждом предложении до показа человеку. Если хотя бы одна проверка падает — предложение блокируется.

### 3.1. Принципы

- **Происхождение обязательно.** У каждой метрики `source ∈ {user_input, derived, assumption}`. Схема физически не позволяет сохранить «придуманное» число — у него не будет ни ссылки на вход, ни формулы, ни допущения, и валидатор его отбракует.
- **Закон сохранения.** Для каждой метрики: `Σ(дети.targetValue) == родитель.targetValue` (с допустимым явным буфером). Расхождение → ошибка верификации.
- **Никакой «тихой» экстраполяции.** `source = derived` требует заполненной `derivation.formula` и перечня входов. Если формулы нет — значение нелегально.
- **Допущения видимы и адресны.** Каждое `Assumption` несёт `needsConfirmationFrom` и `impact`. Нельзя «спрятать» оценку внутри числа.
- **Пробелы вместо догадок.** Если метрики не хватает для расчёта — создаётся `DataGap` с конкретным запросом («дайте *месячный бюджет ФОТ* в *₽/мес*»), а не подставляется правдоподобное число.
- **Честная уверенность.** `confidence = measured` разрешён только при наличии `currentValue` + `measuredAt` + `evidence`. Оценки не маскируются под факты.
- **Полный аудит.** Любая правка (человека или ИИ) пишется в `changeLog` с актором, временем и причиной.

### 3.2. Контракт верификатора

```python
def verify(parent, children) -> Report:
    errors = []

    for metric in parent.metrics:
        # (1) Закон сохранения
        s = sum(c.metric(metric.id).targetValue for c in children
                if c.metric(metric.id))
        if not within_tolerance(s, metric.targetValue, parent.buffer):
            errors.append(ConservationError(metric.id, expected=metric.targetValue, got=s))

    # (2) Происхождение каждого числа
    for c in children:
        for m in c.metrics:
            if m.source == "derived" and not m.derivation:
                errors.append(MissingDerivation(c.id, m.id))
            if m.source == "assumption" and not m.assumptionRef:
                errors.append(OrphanAssumptionValue(c.id, m.id))
            if m.source == "user_input" and m.value not in dataset:
                errors.append(FabricatedInput(c.id, m.id))   # «вход», которого нет

    # (3) Жёсткие ограничения
    for cons in parent.constraints if cons.hard:
        if violates(children, cons):
            errors.append(ConstraintViolation(cons.id))

    # (4) Честность уверенности
    for c in children:
        for m in c.metrics:
            if m.confidence == "measured" and not (m.currentValue and m.evidence):
                errors.append(FakeMeasurement(c.id, m.id))

    return Report(ok=(len(errors) == 0), errors=errors)
```

### 3.3. Системный промпт-контур для генеративной части

Дополнительно к структурным проверкам сама модель инструктируется так:

- «Не вычисляешь — спрашивай.» При нехватке данных верни объект `DataGap`, а не число.
- Любое значение возвращай только с полем `source` и обоснованием.
- Запрещено помечать оценку как `measured`/`user_input`.
- Все оценки оформляй как `assumption` с указанием подтверждающего лица.

> Важно: промпт — лишь первый барьер. Решающим остаётся детерминированный верификатор §3.2, потому что на него нельзя «уговорить» модель.

---

## 4. API для согласования

### 4.1. Конечный автомат согласования узла

```
draft ──(ИИ сформировал)──▶ proposed_by_ai ──(человек открыл)──▶ under_review
   under_review ──approve──▶ approved
   under_review ──reject───▶ rejected
   under_review ──edit─────▶ needs_revision ──(ИИ пересобрал)──▶ proposed_by_ai
   approved     ──(правка выше по дереву)──▶ needs_revision  (каскадный пересчёт)
```

Спуск на следующий уровень (месяц → недели) разрешён **только** из состояния `approved` родителя.

### 4.2. Эндпоинты (REST)

- **`POST /goals`** — создать цель с входными данными. Ответ может сразу содержать `dataGaps`.
- **`GET /goals/{id}`** — получить дерево с метриками, допущениями, статусами.
- **`POST /goals/{id}/decompose`** — тело: `{ "level": "MONTH" | "WEEK" | "DAY", "parentId": "..." }`. Запускает конвейер §2. Ответ: `Proposal` (либо набор `dataGaps`, если заблокировано).
- **`POST /periods/{id}/approve`** — `{ "reviewedBy": "...", "comment": "..." }`.
- **`POST /periods/{id}/reject`** — с обязательным `reason`.
- **`POST /periods/{id}/edit`** — человек правит значения; помечает их `source: user_input`; переводит узел в `needs_revision`.
- **`POST /periods/{id}/alternatives`** — `{ "constraintsOverride": {...}, "count": 3 }` — запросить N альтернативных разбиений с разными приоритетами (например, «дешевле/медленнее» против «дороже/быстрее»).
- **`POST /assumptions/{id}/confirm`** — `{ "status": "confirmed" | "rejected", "actualValue": ... }`. Подтверждение допущения может запустить пересчёт.
- **`POST /goals/{id}/recalculate`** — каскадный пересчёт нижних уровней после изменения верхнего.
- **`GET /goals/{id}/changelog`** — журнал аудита.

### 4.3. Каскадный пересчёт при изменении цели

```python
def on_parent_change(parent, change):
    log(change, triggeredRecalculation=True)
    affected = descendants(parent)
    for node in affected:
        if node.approval.status == "approved":
            node.approval.status = "needs_revision"   # требует повторного согласования
    proposal = decompose(parent, child_level(parent), current_dataset())
    # сохранённые ручные правки человека НЕ затираются молча:
    proposal = merge_preserving_human_edits(proposal, affected)
    return proposal
```

Принцип: пересчёт **предлагает** новое разбиение, но ручные правки человека сохраняются как `user_input` и требуют явного подтверждения замены.

### 4.4. Рекомендации по UI/UX этапов согласования

- **Три вкладки-уровня** (Месяцы → Недели → Дни). Недели заблокированы, пока месяц не `approved`; визуальный «замок» с подсказкой почему.
- **Цветовая кодировка происхождения метрики:** факт/`measured` — сплошной; `derived` — с иконкой формулы (по клику показать вывод); `assumption` — пунктир + значок «?» и имя подтверждающего.
- **Панель «Что мне нужно от вас»** — все активные `DataGap` сверху, с полем ввода и ожидаемой единицей. Блокирующие пробелы выделены и не дают нажать «Декомпозировать».
- **Реестр допущений** — отдельный список с кнопками «Подтвердить / Уточнить / Отклонить» и индикатором, сколько узлов зависит от каждого допущения (`impact`).
- **Дифф при пересчёте** — при изменении цели показывать «было → стало» по каждому затронутому периоду, не применяя молча.
- **Кнопка «Показать альтернативы»** на каждом узле — 2–3 варианта с явным трейд-оффом (срок/бюджет/риск).
- **Лента аудита** — кто (человек/ИИ) и когда внёс правку; ИИ-правки помечены отдельной иконкой.
- **Запрет «зелёного» прогресса без замера:** индикатор выполнения опирается только на `currentValue`/`measuredAt`, а не на план.

---

## 5. Пример работы для цели создания подразделения

**Цель:** «Создать с нуля подразделение в Новосибирске за 6 месяцев, выйти на операционную окупаемость к концу 6-го месяца, нанять 10 сотрудников, открыть офис».

### 5.1. Что ИИ извлекает как измеримые метрики цели

- `headcount` — 10 чел. (`source: user_input`)
- `office_opened` — 1 (бинарно) к месяцу ≤ 6 (`source: user_input`)
- `operating_breakeven` — операционная прибыль ≥ 0 ₽/мес к концу месяца 6 (`source: user_input`)
- `deadline` — 6 месяцев (`source: user_input`)

### 5.2. Шаг gatekeeper: блокирующие пробелы (чисел ещё нет)

ИИ **не предлагает разбиение**, а возвращает `DataGap`:

- «Месячный бюджет / общий стартовый капитал» — ожидается `₽`, `blocksDecomposition: true`.
- «Ожидаемая выручка на 1 сотрудника или unit-экономика» — нужна для расчёта окупаемости.
- «Распределение 10 наймов по ролям и зарплатам» — `₽/мес` на роль.
- «Стоимость аренды офиса в Новосибирске» — `₽/мес`.

### 5.3. После заполнения — допущения вместо догадок

ИИ оформляет неизвестные сроки как явные допущения, а не как факты:

- «Регистрация обособленного подразделения — 5 рабочих дней» → `Assumption`, `needsConfirmationFrom: "юрист"`, `confidence: low`.
- «Подбор первого сотрудника — 3 недели» → `Assumption`, `needsConfirmationFrom: "HR"`.
- «Выручка нарастает линейно с месяца 3» → `Assumption`, `needsConfirmationFrom: "финдиректор"`.

### 5.4. Предложение по месяцам (фрагмент, с проверяемыми связями)

- **Месяц 1.** Вехи: регистрация юрлица (зависимость: ничего); подбор помещения. `headcount: 1` (руководитель). Найм других сотрудников **заблокирован** до готовности офиса (граф зависимостей §2.1).
- **Месяц 2.** `office_opened: 1`; `headcount: +3` (всего 4). Основание распределения найма — допущение о профиле набора (помечено).
- **Месяцы 3–5.** `headcount` доводится до 10 волной; выручка нарастает (источник — допущение, ждёт подтверждения финдиректора).
- **Месяц 6.** Цель `operating_breakeven`. Метрика `derived`: `formula = revenue_m6 − (ФОТ + аренда + прочее)`; все входы перечислены, часть — допущения.

Верификатор проверяет: `Σ headcount по месяцам == 10` ✅; найм не предшествует офису ✅; окупаемость не помечена `measured` (плана ещё нет факта) ✅.

### 5.5. Согласование и спуск ниже

Человек правит «Месяц 2: +2 вместо +3» (правка → `source: user_input`, узел → `needs_revision`), ИИ пересобирает каскад так, чтобы `Σ` снова сошлась к 10, и только после `approved` по всем месяцам открывает декомпозицию **Месяца 1 на недели** — и далее на дни тем же конвейером.

### 5.6. Что произойдёт при изменении цели

Если пользователь меняет дедлайн с 6 на 4 месяца: `changeLog` фиксирует правку, все нижние `approved`-узлы переходят в `needs_revision`, ИИ предлагает уплотнённый план и **явно показывает**, какие допущения стали критичнее (например, скорость найма) и какие новые `DataGap` возникли (например, «нужен ли бюджет на агентство по подбору?»).

---

### Краткий чек-лист реализации

- [ ] Схема хранит `source` у каждого числа; тип «выдумано» невозможен.
- [ ] Детерминированный верификатор запускается до показа человеку.
- [ ] Закон сохранения метрик между уровнями проверяется автоматически.
- [ ] Блокирующие `DataGap` останавливают декомпозицию.
- [ ] Допущения адресны (`needsConfirmationFrom`) и связаны с зависимыми узлами.
- [ ] Спуск на уровень ниже только из `approved`.
- [ ] Каскадный пересчёт сохраняет ручные правки и показывает дифф.
- [ ] Полный аудит (человек/ИИ, время, причина).
