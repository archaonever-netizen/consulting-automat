# ИИ-генератор BPMN-процессов с редактором (BPMN Process Designer)

Документация инструмента **«Процессы»** в модуле **Проекты**: ИИ генерирует BPMN-схему
бизнес-процесса по текстовому описанию, а пользователь правит её в визуальном редакторе
(bpmn-js) и сохраняет. Описывает, что это, как устроено, какие приняты архитектурные решения,
где будет лежать код, как расширять и какие есть подводные камни.

> **СТАТУС: проектная спека (design spec).** На момент написания функционал **ещё не
> реализован** — документ описывает планируемую архитектуру, а не существующий код. Пути файлов
> ниже — целевые. По мере реализации помечать разделы как готовые.
>
> Связанные документы: [SECTION_COMPOSITION.md](SECTION_COMPOSITION.md) (образец формата и
> паттернов LLM-конвейера). Память сессий: `memory/bpmn-process-designer.md` (создать при старте).

---

## 1. Что это и зачем

«Процессы» — инструмент, который превращает **текстовое описание бизнес-процесса** в
**редактируемую BPMN 2.0-диаграмму**. Типовой сценарий консалтинга: описать процесс клиента
(«согласование отпуска», «обработка заявки», «онбординг») словами → получить схему → довести
руками → сохранить как артефакт проекта.

Ключевое разделение ролей:

- **ИИ** генерирует не картинку и не финальный XML, а **семантику процесса** (узлы и связи).
- **Наш backend** детерминированно собирает из неё валидный BPMN 2.0 XML.
- **bpmn-auto-layout** (на фронте) расставляет геометрию (координаты, стрелки).
- **bpmn-js (BpmnModeler)** показывает схему и даёт её править.
- XML сохраняется в БД как артефакт проекта.

Это **редактор** (в отличие от read-only «Композиции раздела»): результат генерации — лишь
стартовая точка, пользователь почти всегда правит схему вручную.

---

## 2. Ключевое архитектурное решение — ИИ отдаёт JSON, XML собираем сами

**ИИ НЕ генерирует BPMN XML напрямую.** Он возвращает строгий JSON со списком узлов и связей,
а семантический BPMN-XML из него собирает Python-код.

```
описание процесса
        │
        ▼
[ИИ] → строгий JSON  { nodes:[{id,type,name}], flows:[{id,source,target,name?}] }
        │              (temperature=0, как декомпозиция целей)
        ▼
[build_bpmn_xml]  Python детерминированно → семантический BPMN 2.0 XML
        │           БЕЗ блока bpmndi (без координат)
        ▼
[layoutProcess]  bpmn-auto-layout на фронте → добавляет bpmndi (геометрию)
        │
        ▼
[BpmnModeler.importXML]  bpmn-js рисует редактируемую схему
        │
        ▼  пользователь правит
        ▼
[modeler.saveXML]  →  PUT/POST  →  bpmn_xml в БД
```

**Почему так, а не «ИИ → готовый XML»:**

1. **Совпадает с существующим паттерном проекта.** «ИИ отдаёт JSON, мы парсим сами» — ровно
   так работает [goal_decomposition](backend/services/goal_decomposition/llm.py) (temperature=0,
   ответ берётся как сырой текст и парсится вручную). Не вводим новый стиль.
2. **XML всегда валиден.** Разметку собирает наш код — ИИ физически не может сломать структуру,
   namespace или экранирование спецсимволов в названиях задач.
3. **ИИ не умеет в раскладку.** bpmn-js, чтобы *нарисовать* схему, нужен блок `bpmndi:BPMNDiagram`
   с координатами `x/y` каждого элемента и `waypoint` каждой стрелки. LLM расставляет их плохо:
   на выходе — «валидный» XML, который импортируется без ошибки, но рисуется как куча
   наложенных прямоугольников или пустой холст. Геометрию детерминированно считает
   `bpmn-auto-layout`.
4. **Нет хрупкого цикла «невалидный XML → переотправь в ИИ → почини».** Этот цикл (его советуют
   в наивной схеме интеграции) не нужен вовсе: ошибка структуры в нашем подходе невозможна.

> **Главная грабля наивного подхода (зафиксировать в памяти):** проблема не в «невалидном XML»,
> а в **отсутствии геометрии**. Даже идеально валидный по схеме BPMN без `bpmndi` в bpmn-js не
> рисуется. Решение — снять раскладку с ИИ и отдать `bpmn-auto-layout`.

---

## 3. Контракт ИИ (JSON-схема процесса)

ИИ обязан вернуть JSON ровно такой формы (без обёрток, без markdown):

```json
{
  "nodes": [
    { "id": "start",  "type": "startEvent",       "name": "Заявка получена" },
    { "id": "t1",     "type": "userTask",          "name": "Проверить заявку" },
    { "id": "gw1",    "type": "exclusiveGateway",  "name": "Корректна?" },
    { "id": "t2",     "type": "serviceTask",       "name": "Зарегистрировать" },
    { "id": "end_ok", "type": "endEvent",          "name": "Готово" }
  ],
  "flows": [
    { "id": "f1", "source": "start", "target": "t1" },
    { "id": "f2", "source": "t1",    "target": "gw1" },
    { "id": "f3", "source": "gw1",   "target": "t2",     "name": "да" },
    { "id": "f4", "source": "gw1",   "target": "end_ok", "name": "нет" }
  ]
}
```

Допустимые `type`: `startEvent`, `endEvent`, `task`, `userTask`, `serviceTask`,
`exclusiveGateway`, `parallelGateway` (набор расширяется по мере надобности — см. §8).

**Валидация в Python после парсинга** (до сборки XML):
- есть ≥1 `startEvent` и ≥1 `endEvent`;
- все `flow.source` / `flow.target` ссылаются на существующие `node.id`;
- `id` уникальны;
- нет узлов без единой связи (висячие — отбрасываются или возвращается ошибка).

Невалидный/непарсящийся JSON → одна авто-повторная попытка, иначе понятная ошибка в UI.

---

## 4. Backend

Промптра-клиент и `get_llm` переиспользуются как есть
([llm_client.py](backend/services/llm_client.py)).

### 4.1 Сервис — [backend/services/process_designer.py](backend/services/process_designer.py)

| Функция | Назначение |
|---|---|
| `async generate_process(description) -> dict` | Зовёт `get_llm(model=…, temperature=0)`, строгий system-промпт (схема §3), парсит JSON тем же надёжным способом, что декомпозиция. Возвращает `{nodes, flows}`. |
| `validate_process(process) -> None` | Проверки из §3; кидает понятную ошибку. |
| `build_bpmn_xml(process) -> str` | **Чистая функция.** JSON → семантический BPMN 2.0 XML без `bpmndi`. Полностью детерминированна, тестируема без ИИ. |

### 4.2 Модель — `ProjectProcess` в [backend/models.py](backend/models.py)

По образцу `ProjectCardState`. **Несколько процессов на проект** (список):

```
ProjectProcess:
  id, project_id (FK → projects, CASCADE, index),
  name (String 200),
  source_description (Text)   # исходный текст, из которого сгенерировано
  bpmn_xml (Text),            # последний сохранённый XML (уже с правками и DI)
  created_at, updated_at
  relationship → Project
```

Идемпотентное создание таблицы — добавить `_ensure_project_process_table(conn)` в `lifespan`
[main.py](backend/main.py) (паттерн «без Alembic на старте», как `_ensure_*_columns`).

### 4.3 Роут — [backend/routes/processes.py](backend/routes/processes.py)

Все ручки с `Depends(get_current_user_dep)` и `Depends(get_db)` (как в
[goals.py](backend/routes/goals.py)). Регистрация в [main.py](backend/main.py):
`app.include_router(processes.router, prefix="/api/projects", tags=["processes"])`.

| Метод | Путь | Тело / ответ |
|---|---|---|
| `POST` | `/{id}/processes/generate` | `{description}` → `{process_json, bpmn_xml}` — **предпросмотр без сохранения** |
| `GET`  | `/{id}/processes` | список процессов проекта |
| `POST` | `/{id}/processes` | `{name, bpmn_xml, source_description}` → создать |
| `PUT`  | `/{id}/processes/{pid}` | `{name?, bpmn_xml}` → обновить после правок |
| `DELETE` | `/{id}/processes/{pid}` | удалить |

---

## 5. Frontend

### 5.1 Зависимости (в `frontend/`)

```
npm install bpmn-js bpmn-auto-layout
```

### 5.2 Компонент-обёртка — [BpmnEditor.tsx](frontend/src/components/projects/BpmnEditor.tsx)

bpmn-js — vanilla JS, монтируется в DOM-контейнер; в React оборачиваем через ref + effect:

- `BpmnModeler` создаётся в `useEffect` на `containerRef`; в **cleanup обязателен
  `modeler.destroy()`** — иначе React 19 StrictMode (двойной mount в dev) даёт два холста.
- Импорт CSS bpmn-js: `diagram-js.css`, `bpmn-js/dist/assets/bpmn-js.css` и шрифт `bpmn-font`.
- Если переданный XML **без DI** (свежая генерация) — прогнать через `layoutProcess()` из
  `bpmn-auto-layout` перед `importXML`. Если XML уже с DI (загружен из БД) — импортировать как есть.
- Наружу через `ref`/коллбэк: `getXml()` (= `saveXML({ format: true })`) для кнопки «Сохранить».

### 5.3 Ленивая загрузка (важно — bundle size)

bpmn-js тяжёлый (~сотни КБ). Грузить редактор через `lazy()` / dynamic import, как все страницы
в [App.tsx](frontend/src/App.tsx#L14). Желательно — отдельный manualChunk в `vite.config`, чтобы
bpmn-js не попадал в основной бандл и грузился только при открытии вкладки «Процессы».

### 5.4 UI — вкладка «Процессы» в [ProjectDetailPage.tsx](frontend/src/pages/ProjectDetailPage.tsx)

*(Рекомендуемое место: процессы принадлежат проекту. Альтернативы — отдельная страница
`/processes` или внутри `/orchestration` — переключаются тривиально.)*

- textarea с описанием → кнопка **«Сгенерировать»** → `POST …/processes/generate` → редактор с
  предпросмотром → кнопка **«Сохранить»** (`POST`/`PUT`).
- Список сохранённых процессов проекта: открыть / переименовать / удалить.
- Все запросы — через существующий `api` (axios, [api.ts](frontend/src/services/api.ts)).
- Добавить правило инвалидации `[/^\/api\/projects\/\d+\/processes/, ['processes']]` в
  `INVALIDATION_RULES` [api.ts](frontend/src/services/api.ts#L23).

---

## 6. Поток данных (сверху вниз)

```
[textarea: описание процесса]
        │  «Сгенерировать»
        ▼
POST /api/projects/{id}/processes/generate  { description }
        │
        ▼
[generate_process]  ИИ → JSON {nodes,flows}  →  validate_process  →  build_bpmn_xml
        │  ответ: { process_json, bpmn_xml }   (XML без DI)
        ▼
[BpmnEditor]  layoutProcess(bpmn_xml) → +DI → modeler.importXML
        │  пользователь правит схему
        ▼  «Сохранить» → getXml()
POST/PUT /api/projects/{id}/processes  { name, bpmn_xml(+DI), source_description }
        │
        ▼
[ProjectProcess в БД]  ← список на вкладке, открытие грузит XML с DI как есть
```

---

## 7. Карта кода (целевая)

**Backend** (`backend/`):
- `services/process_designer.py` — `generate_process`, `validate_process`, `build_bpmn_xml`,
  промпт, константа модели.
- `routes/processes.py` — CRUD + `generate`.
- `models.py` — `ProjectProcess`.
- `main.py` — `_ensure_project_process_table`, регистрация роутера.
- `tests/test_process_designer.py` — тесты `build_bpmn_xml` и парсинга.

**Frontend** (`frontend/src/`):
- `components/projects/BpmnEditor.tsx` — обёртка над BpmnModeler + auto-layout.
- `pages/ProjectDetailPage.tsx` — вкладка «Процессы», генерация/список/сохранение.
- `services/api.ts` — правило инвалидации.
- `vite.config.*` — manualChunk для bpmn-js (опционально).

---

## 8. Как расширять

- **Новый тип узла** (например `sendTask`, `intermediateCatchEvent`): добавить тип в перечень
  §3, в маппинг `build_bpmn_xml` (тег BPMN-элемента) и в системный промпт. Раскладку
  `bpmn-auto-layout` подхватит автоматически.
- **Дорожки/пулы (lanes/pools)**: отдельная веха — и контракт ИИ, и `build_bpmn_xml` усложняются
  (collaboration + participants), и у `bpmn-auto-layout` поддержка пулов ограничена. Не входит
  в MVP.
- **Регенерация по уточнению**: добавить в `generate_process` приём текущего JSON + правки
  пользователя («добавь шаг согласования юристом») и пересборку.

---

## 9. Известные подводные камни и риски

1. **Размер бандла.** bpmn-js большой → обязательны lazy-load и отдельный chunk, иначе раздувает
   основное приложение.
2. **React 19 StrictMode — двойной холст.** Без `modeler.destroy()` в cleanup `useEffect` в dev
   рисуются две диаграммы. Всегда уничтожать инстанс.
3. **Пределы auto-layout.** `bpmn-auto-layout` уверенно кладёт tasks / events / gateways / flows;
   пулы, дорожки и очень разветвлённые схемы — слабее. Для генерации из текста этого достаточно,
   ручная доводка — в Modeler.
4. **CSS обязателен.** Без импорта стилей bpmn-js и шрифта схема рисуется без иконок и панели
   инструментов. Частая причина «редактор открылся, но пустой/кривой».
5. **Кривой JSON от ИИ.** Снимается строгой схемой + `temperature=0` + одной авто-повторной
   попыткой; при повторном провале — явная ошибка, а не пустая схема.
6. **DI на сохранении.** Сохраняем XML **уже с DI** (после правок в Modeler), чтобы при открытии
   не пере-раскладывать (иначе потеряются ручные перемещения элементов). `layoutProcess` гоняем
   только для свежесгенерированного XML без DI.

---

## 10. Почему так (резюме решений)

- **ИИ → JSON, XML собираем сами** — валидность гарантирована кодом, совпадает с паттерном
  декомпозиции, убирает цикл починки XML.
- **Раскладку отдаём bpmn-auto-layout** — LLM не умеет в координаты; без DI bpmn-js не рисует.
- **BpmnModeler, а не Viewer** — после генерации почти всегда нужна ручная правка.
- **Несколько процессов на проект** — у одного консалтингового проекта обычно несколько
  процессных карт.
- **Lazy-load + chunk** — bpmn-js слишком тяжёл для основного бандла.
