import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';
import {
  defaultLandingContent,
  mergeLandingContent,
  type HideableSection,
  type LandingContent,
} from '../landing/content';

/**
 * Редактор текста публичного лендинга (только сотрудники).
 *
 * Правит единый документ контента (frontend/src/landing/content.ts) и сохраняет
 * его целиком через PUT /api/landing/content. Лендинг подтягивает этот текст на
 * лету — правки видны посетителям без пересборки и деплоя.
 *
 * Поля-компоненты объявлены на уровне модуля (не внутри страницы): иначе при
 * каждом рендере создавался бы новый тип компонента и input терял бы фокус на
 * каждом символе.
 */

// ── Иммутабельная установка значения по пути в объекте/массиве ──
function setByPath<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const clone: any = Array.isArray(obj) ? [...(obj as any[])] : { ...(obj as any) };
  clone[head] = setByPath(clone[head], rest, value);
  return clone;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// Легаси-миграция шагов «Как это работает»: раньше шаг хранил абзац text, теперь
// список points. Сохранённый в БД контент может прийти в старой форме — переносим
// text в первый пункт (и выбрасываем легаси-ключ), чтобы редактор показал текст,
// а не пустой список. Публичный рендер тоже умеет fallback на text (страховка).
function normalizeHowSteps(content: LandingContent): LandingContent {
  const steps = content.how?.steps as unknown[] | undefined;
  if (!Array.isArray(steps)) return content;
  let changed = false;
  const next = steps.map((raw) => {
    const s = raw as { week?: string; title?: string; points?: string[]; text?: string };
    const hasPoints = Array.isArray(s.points) && s.points.length > 0;
    if (!('text' in s)) return s;
    changed = true;
    const { text, ...rest } = s;
    return hasPoints ? rest : { ...rest, points: text?.trim() ? [text] : [''] };
  });
  return changed ? ({ ...content, how: { ...content.how, steps: next } } as LandingContent) : content;
}

// ── Примитивные поля ──
function TextInput({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span className="form-label" style={{ margin: 0 }}>{label}</span>
      {multiline ? (
        <textarea
          className="form-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 74 }}
        />
      ) : (
        <input className="form-input" type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

// Панель управления элементом списка (вверх/вниз/удалить).
function RowControls({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(index, index - 1)} title="Вверх">↑</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} title="Вниз">↓</button>
      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onRemove(index)} title="Удалить">
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

// ── Список строк ──
function StringListEditor({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  multiline?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="form-label" style={{ margin: 0 }}>{label}</span>
      {value.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {multiline ? (
            <textarea
              className="form-textarea"
              value={item}
              onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
              style={{ minHeight: 64, flex: 1 }}
            />
          ) : (
            <input
              className="form-input"
              type="text"
              value={item}
              onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
              style={{ flex: 1 }}
            />
          )}
          <RowControls
            index={i}
            count={value.length}
            onMove={(from, to) => onChange(moveItem(value, from, to))}
            onRemove={(idx) => onChange(value.filter((_, j) => j !== idx))}
          />
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, ''])}>
          <Icon name="plus" size={14} /> Добавить пункт
        </button>
      </div>
    </div>
  );
}

// ── Список объектов с фиксированными строковыми полями ──
interface ObjField {
  key: string;
  label: string;
  multiline?: boolean;
}
function ObjectListEditor({
  label,
  value,
  onChange,
  fields,
}: {
  label: string;
  value: Record<string, string>[];
  onChange: (v: Record<string, string>[]) => void;
  fields: ObjField[];
}) {
  const makeEmpty = (): Record<string, string> => Object.fromEntries(fields.map((f) => [f.key, '']));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="form-label" style={{ margin: 0 }}>{label}</span>
      {value.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>#{i + 1}</span>
            <RowControls
              index={i}
              count={value.length}
              onMove={(from, to) => onChange(moveItem(value, from, to))}
              onRemove={(idx) => onChange(value.filter((_, j) => j !== idx))}
            />
          </div>
          {fields.map((f) => (
            <TextInput
              key={f.key}
              label={f.label}
              value={item[f.key] ?? ''}
              multiline={f.multiline}
              onChange={(v) => onChange(value.map((it, j) => (j === i ? { ...it, [f.key]: v } : it)))}
            />
          ))}
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, makeEmpty()])}>
          <Icon name="plus" size={14} /> Добавить
        </button>
      </div>
    </div>
  );
}

// ── Шаги «Как это работает»: неделя + заголовок + список пунктов ──
// Отдельный редактор (не ObjectListEditor): у шага есть вложенный список points,
// который правится через StringListEditor.
function HowStepsEditor({
  value,
  onChange,
}: {
  value: { week: string; title: string; points: string[] }[];
  onChange: (v: { week: string; title: string; points: string[] }[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="form-label" style={{ margin: 0 }}>Шаги (недели)</span>
      {value.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>#{i + 1}</span>
            <RowControls
              index={i}
              count={value.length}
              onMove={(from, to) => onChange(moveItem(value, from, to))}
              onRemove={(idx) => onChange(value.filter((_, j) => j !== idx))}
            />
          </div>
          <TextInput
            label="Неделя"
            value={item.week}
            onChange={(v) => onChange(value.map((it, j) => (j === i ? { ...it, week: v } : it)))}
          />
          <TextInput
            label="Заголовок"
            value={item.title}
            onChange={(v) => onChange(value.map((it, j) => (j === i ? { ...it, title: v } : it)))}
          />
          <StringListEditor
            label="Пункты"
            value={item.points ?? []}
            onChange={(v) => onChange(value.map((it, j) => (j === i ? { ...it, points: v } : it)))}
          />
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange([...value, { week: '', title: '', points: [''] }])}
        >
          <Icon name="plus" size={14} /> Добавить
        </button>
      </div>
    </div>
  );
}

// ── Таблица метрик: строка = подпись + значения по неделям ──
function MetricsEditor({
  value,
  onChange,
}: {
  value: { label: string; values: string[] }[];
  onChange: (v: { label: string; values: string[] }[]) => void;
}) {
  const cols = value[0]?.values.length ?? 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="form-label" style={{ margin: 0 }}>Строки таблицы метрик</span>
      {value.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>#{i + 1}</span>
            <RowControls
              index={i}
              count={value.length}
              onMove={(from, to) => onChange(moveItem(value, from, to))}
              onRemove={(idx) => onChange(value.filter((_, j) => j !== idx))}
            />
          </div>
          <TextInput
            label="Метрика"
            value={row.label}
            onChange={(v) => onChange(value.map((r, j) => (j === i ? { ...r, label: v } : r)))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
            {row.values.map((val, vi) => (
              <label key={vi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>Неделя {vi + 1}</span>
                <input
                  className="form-input"
                  type="text"
                  value={val}
                  onChange={(e) =>
                    onChange(
                      value.map((r, j) =>
                        j === i ? { ...r, values: r.values.map((x, k) => (k === vi ? e.target.value : x)) } : r,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange([...value, { label: '', values: Array.from({ length: cols }, () => '') }])}
        >
          <Icon name="plus" size={14} /> Добавить строку
        </button>
      </div>
    </div>
  );
}

// Секция-«гармошка».
// Если передан onToggleHidden — в заголовке появляется кнопка «Убрать с сайта»/
// «Вернуть на сайт». Скрытая секция сворачивается, помечается бейджем и не
// показывает поля (текст не теряется — его можно вернуть той же кнопкой).
function Section({
  title,
  children,
  open,
  hidden,
  onToggleHidden,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
}) {
  return (
    <details
      open={hidden ? false : open}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card-bg)',
        opacity: hidden ? 0.6 : 1,
      }}
    >
      <summary
        className="le-summary"
        style={{
          cursor: 'pointer',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: '-.02em',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {title}
          {hidden && (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              Скрыт с сайта
            </span>
          )}
        </span>
        {onToggleHidden && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0, color: hidden ? undefined : 'var(--danger)' }}
            // Клик по кнопке не должен раскрывать/сворачивать <details>.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleHidden();
            }}
          >
            {hidden ? (
              'Вернуть на сайт'
            ) : (
              <>
                <Icon name="trash" size={14} /> Убрать с сайта
              </>
            )}
          </button>
        )}
      </summary>
      {!hidden && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 18px 20px' }}>{children}</div>
      )}
    </details>
  );
}

export default function LandingEditorPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ data: unknown; updated_at: string | null }>({
    queryKey: ['landing-content'],
    queryFn: async () => (await api.get('/api/landing/content')).data,
  });

  const [form, setForm] = useState<LandingContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (data !== undefined) {
      setForm(deepClone(normalizeHowSteps(mergeLandingContent(defaultLandingContent, data?.data))));
    }
  }, [data]);

  // Хелперы: поле по пути и список по пути.
  function bind(path: (string | number)[]) {
    return {
      value: path.reduce<any>((acc, k) => (acc == null ? acc : acc[k]), form) ?? '',
      onChange: (v: unknown) => setForm((f) => (f ? setByPath(f, path, v) : f)),
    };
  }

  // Переключить видимость раздела на публичном лендинге (скрыть/вернуть).
  function toggleHidden(key: HideableSection) {
    setForm((f) => (f ? { ...f, hidden: { ...f.hidden, [key]: !f.hidden?.[key] } } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      const res = await api.put('/api/landing/content', { data: form });
      queryClient.setQueryData(['landing-content'], res.data);
      setSavedNote('Сохранено. Обновите лендинг — текст уже там.');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !form) return <div className="page"><div className="loading-bar" /></div>;

  const c = form;

  return (
    <div className="page">
      {/* flex-заголовок у <summary> убирает нативный треугольник-маркер — гасим
          его и в WebKit, чтобы кнопка «Убрать с сайта» встала ровно справа. */}
      <style>{`
        .le-summary { list-style: none; }
        .le-summary::-webkit-details-marker { display: none; }
      `}</style>
      <div
        className="page-head rise"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg)',
          paddingTop: 8,
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <h1>Лендинг</h1>
          <p>
            Текст публичного лендинга. Сохранение сразу меняет текст на сайте — без пересборки и деплоя.
            Ненужный раздел можно убрать с сайта кнопкой в его заголовке (текст сохранится — раздел можно вернуть).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <a className="btn btn-ghost" href="/" target="_blank" rel="noopener noreferrer">Открыть лендинг</a>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>Сбросить к исходному</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {(savedNote || error) && (
        <div
          className="rise"
          style={{
            margin: '12px 0',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 14,
            background: error ? 'var(--danger-bg, #fdecea)' : 'var(--success-bg, #e7f6ec)',
            color: error ? 'var(--danger, #b3261e)' : 'var(--success, #157347)',
          }}
        >
          {error || savedNote}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16, maxWidth: 860 }}>
        <Section title="Шапка и общее" open>
          <TextInput label="Название (в шапке и подвале)" {...bind(['brand'])} />
          <TextInput label="Ссылка «Войти»" {...bind(['nav', 'login'])} />
          <TextInput label="Кнопка «Оставить заявку» (в шапке)" {...bind(['nav', 'cta'])} />
        </Section>

        <Section title="Первый экран (Hero)" hidden={c.hidden.hero} onToggleHidden={() => toggleHidden('hero')}>
          <TextInput label="Надзаголовок" {...bind(['hero', 'eyebrow'])} multiline />
          <TextInput label="Заголовок" {...bind(['hero', 'title'])} multiline />
          <TextInput label="Подзаголовок 1" {...bind(['hero', 'subtitle1'])} multiline />
          <TextInput label="Подзаголовок 2" {...bind(['hero', 'subtitle2'])} multiline />
          <TextInput label="Кнопка" {...bind(['hero', 'ctaButton'])} />
          <TextInput label="Примечание под кнопкой" {...bind(['hero', 'ctaNote'])} multiline />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <TextInput label="Стат-карточка — подпись" {...bind(['hero', 'statLabel'])} />
            <TextInput label="Стат-карточка — значение" {...bind(['hero', 'statValue'])} />
            <TextInput label="Стат-карточка — единица" {...bind(['hero', 'statUnit'])} />
          </div>
        </Section>

        <Section title="Боль клиента" hidden={c.hidden.pain} onToggleHidden={() => toggleHidden('pain')}>
          <TextInput label="Надзаголовок" {...bind(['pain', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['pain', 'title'])} multiline />
          <TextInput label="Вступление" {...bind(['pain', 'intro'])} multiline />
          <StringListEditor label="Пункты" {...bind(['pain', 'points'])} multiline />
          <TextInput label="Вывод (жирный)" {...bind(['pain', 'outroBold'])} multiline />
          <TextInput label="Вывод (обычный)" {...bind(['pain', 'outroText'])} multiline />
        </Section>

        <Section title="Рабочая неделя" hidden={c.hidden.week} onToggleHidden={() => toggleHidden('week')}>
          <TextInput label="Надзаголовок" {...bind(['week', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['week', 'title'])} multiline />
          <ObjectListEditor
            label="Сцены"
            {...bind(['week', 'scenes'])}
            fields={[
              { key: 'day', label: 'День / время' },
              { key: 'text', label: 'Текст', multiline: true },
            ]}
          />
          <TextInput label="Вывод" {...bind(['week', 'outro'])} multiline />
        </Section>

        <Section title="Подход / решение" hidden={c.hidden.solution} onToggleHidden={() => toggleHidden('solution')}>
          <TextInput label="Надзаголовок" {...bind(['solution', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['solution', 'title'])} multiline />
          <TextInput label="Абзац 1" {...bind(['solution', 'text1'])} multiline />
          <TextInput label="Абзац 2" {...bind(['solution', 'text2'])} multiline />
          <TextInput label="Абзац 3" {...bind(['solution', 'text3'])} multiline />
          <TextInput label="Вступление к списку" {...bind(['solution', 'resultIntro'])} multiline />
          <StringListEditor label="Пункты результата" {...bind(['solution', 'resultItems'])} />
        </Section>

        <Section title="Как это работает (недели)" hidden={c.hidden.how} onToggleHidden={() => toggleHidden('how')}>
          <TextInput label="Надзаголовок" {...bind(['how', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['how', 'title'])} multiline />
          <HowStepsEditor {...bind(['how', 'steps'])} />
        </Section>

        <Section title="Продукт" hidden={c.hidden.product} onToggleHidden={() => toggleHidden('product')}>
          <TextInput label="Надзаголовок" {...bind(['product', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['product', 'title'])} multiline />
          <TextInput label="Вступление" {...bind(['product', 'intro'])} multiline />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <TextInput label="Формат — подпись" {...bind(['product', 'formatLabel'])} />
            <TextInput label="Формат — значение" {...bind(['product', 'formatValue'])} />
            <TextInput label="Стоимость — подпись" {...bind(['product', 'priceLabel'])} />
            <TextInput label="Стоимость — значение" {...bind(['product', 'priceValue'])} />
            <TextInput label="Для кого — подпись" {...bind(['product', 'audienceLabel'])} />
            <TextInput label="Для кого — значение" {...bind(['product', 'audienceValue'])} />
            <TextInput label="Результат — подпись" {...bind(['product', 'resultLabel'])} />
            <TextInput label="Результат — значение" {...bind(['product', 'resultValue'])} />
          </div>
          <TextInput label="Заголовок «Что входит»" {...bind(['product', 'includedTitle'])} />
          <StringListEditor label="Что входит" {...bind(['product', 'included'])} multiline />
        </Section>

        <Section title="Первые блоки" hidden={c.hidden.blocks} onToggleHidden={() => toggleHidden('blocks')}>
          <TextInput label="Надзаголовок" {...bind(['blocks', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['blocks', 'title'])} multiline />
          <ObjectListEditor
            label="Блоки"
            {...bind(['blocks', 'items'])}
            fields={[
              { key: 'title', label: 'Заголовок' },
              { key: 'text', label: 'Текст', multiline: true },
            ]}
          />
          <TextInput label="Заголовок «Инструменты продукта»" {...bind(['blocks', 'toolsTitle'])} />
          <TextInput label="Текст «Инструменты продукта»" {...bind(['blocks', 'toolsText'])} multiline />
        </Section>

        <Section title="Почему это работает" hidden={c.hidden.why} onToggleHidden={() => toggleHidden('why')}>
          <TextInput label="Надзаголовок" {...bind(['why', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['why', 'title'])} multiline />
          <ObjectListEditor
            label="Принципы"
            {...bind(['why', 'items'])}
            fields={[
              { key: 'num', label: 'Номер' },
              { key: 'title', label: 'Заголовок' },
              { key: 'text', label: 'Текст', multiline: true },
            ]}
          />
          <TextInput label="Заголовок «Что меняется»" {...bind(['why', 'afterTitle'])} />
          <TextInput label="Абзац 1" {...bind(['why', 'afterText1'])} multiline />
          <TextInput label="Абзац 2" {...bind(['why', 'afterText2'])} multiline />
          <StringListEditor label="Список-столбик (справа)" {...bind(['why', 'afterLines'])} />
        </Section>

        <Section title="Измеримость / метрики" hidden={c.hidden.proof} onToggleHidden={() => toggleHidden('proof')}>
          <TextInput label="Надзаголовок" {...bind(['proof', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['proof', 'title'])} multiline />
          <TextInput label="Вступление" {...bind(['proof', 'intro'])} multiline />
          <StringListEditor label="Заголовки колонок таблицы" {...bind(['proof', 'metricsHead'])} />
          <MetricsEditor {...bind(['proof', 'metricsRows'])} />
          <TextInput label="Подпись перед группами" {...bind(['proof', 'groupsIntro'])} multiline />
          <ObjectListEditor
            label="Группы метрик"
            {...bind(['proof', 'groups'])}
            fields={[
              { key: 'title', label: 'Заголовок' },
              { key: 'text', label: 'Текст', multiline: true },
            ]}
          />
        </Section>

        <Section title="Ситуации" hidden={c.hidden.situations} onToggleHidden={() => toggleHidden('situations')}>
          <TextInput label="Надзаголовок" {...bind(['situations', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['situations', 'title'])} multiline />
          <ObjectListEditor
            label="Ситуации"
            {...bind(['situations', 'items'])}
            fields={[
              { key: 'num', label: 'Номер' },
              { key: 'title', label: 'Заголовок' },
              { key: 'text', label: 'Текст', multiline: true },
            ]}
          />
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <TextInput label="Кейсы «было/стало» — заголовок блока" {...bind(['situations', 'casesRowTitle'])} />
          <TextInput label="Кейсы «было/стало» — вступление" {...bind(['situations', 'casesRowIntro'])} multiline />
          <ObjectListEditor
            label="Карточки кейсов (было/стало)"
            {...bind(['situations', 'casesItems'])}
            fields={[
              { key: 'industry', label: 'Отрасль (пилюля)' },
              { key: 'before', label: 'Было', multiline: true },
              { key: 'after', label: 'Стало', multiline: true },
              { key: 'metric', label: 'Метрика (напр. –80%)' },
              { key: 'metricLabel', label: 'Подпись метрики' },
            ]}
          />
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <TextInput label="Заголовок «Если нужны кейсы»" {...bind(['situations', 'casesTitle'])} />
          <TextInput label="Кейсы — абзац 1" {...bind(['situations', 'casesText1'])} multiline />
          <TextInput label="Кейсы — абзац 2" {...bind(['situations', 'casesText2'])} multiline />
          <TextInput label="Кейсы — правая колонка" {...bind(['situations', 'casesRight'])} multiline />
        </Section>

        <Section title="Возражения" hidden={c.hidden.objections} onToggleHidden={() => toggleHidden('objections')}>
          <TextInput label="Надзаголовок" {...bind(['objections', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['objections', 'title'])} multiline />
          <ObjectListEditor
            label="Возражения"
            {...bind(['objections', 'items'])}
            fields={[
              { key: 'q', label: 'Возражение', multiline: true },
              { key: 'a', label: 'Ответ', multiline: true },
            ]}
          />
        </Section>

        <Section title="FAQ" hidden={c.hidden.faq} onToggleHidden={() => toggleHidden('faq')}>
          <TextInput label="Надзаголовок" {...bind(['faq', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['faq', 'title'])} />
          <ObjectListEditor
            label="Вопросы"
            {...bind(['faq', 'items'])}
            fields={[
              { key: 'q', label: 'Вопрос' },
              { key: 'a', label: 'Ответ', multiline: true },
            ]}
          />
        </Section>

        <Section title="Финальный блок и форма" hidden={c.hidden.cta} onToggleHidden={() => toggleHidden('cta')}>
          <TextInput label="Надзаголовок" {...bind(['cta', 'eyebrow'])} />
          <TextInput label="Заголовок" {...bind(['cta', 'title'])} multiline />
          <TextInput label="Текст" {...bind(['cta', 'text'])} multiline />
          <TextInput label="Примечание" {...bind(['cta', 'note'])} multiline />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <TextInput label="Поле «Имя» — подпись" {...bind(['cta', 'nameLabel'])} />
            <TextInput label="Поле «Имя» — плейсхолдер" {...bind(['cta', 'namePlaceholder'])} />
            <TextInput label="Поле «Телефон» — подпись" {...bind(['cta', 'phoneLabel'])} />
            <TextInput label="Поле «Телефон» — плейсхолдер" {...bind(['cta', 'phonePlaceholder'])} />
            <TextInput label="Поле «Ситуация» — подпись" {...bind(['cta', 'noteLabel'])} />
            <TextInput label="Поле «Ситуация» — плейсхолдер" {...bind(['cta', 'notePlaceholder'])} />
          </div>
          <TextInput label="Согласие — текст до ссылки" {...bind(['cta', 'consentPrefix'])} />
          <TextInput label="Согласие — текст ссылки" {...bind(['cta', 'consentLink'])} />
          <TextInput label="Согласие — текст после ссылки" {...bind(['cta', 'consentSuffix'])} />
          <TextInput label="Кнопка отправки" {...bind(['cta', 'submit'])} />
          <TextInput label="Кнопка во время отправки" {...bind(['cta', 'submitSending'])} />
          <TextInput label="Текст ошибки отправки" {...bind(['cta', 'error'])} multiline />
          <TextInput label="Успех — заголовок" {...bind(['cta', 'successTitle'])} />
          <TextInput label="Успех — текст" {...bind(['cta', 'successText'])} multiline />
        </Section>

        <Section title="Подвал">
          <TextInput label="Название" {...bind(['footer', 'brand'])} />
          <TextInput label="Подпись" {...bind(['footer', 'tagline'])} multiline />
        </Section>

        {/* Невидимое использование c — держит тип актуальным при развитии схемы. */}
        <div style={{ display: 'none' }}>{c.brand}</div>
      </div>

      {confirmReset && (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 60 }} onClick={(e) => { if (e.target === e.currentTarget) setConfirmReset(false); }}>
          <div className="modal-card">
            <h3 className="modal-title">Сбросить к исходному тексту?</h3>
            <p className="modal-text">
              Все поля вернутся к тексту, вшитому в приложение. Несохранённые правки в форме пропадут.
              Чтобы это попало на сайт, после сброса нужно нажать «Сохранить».
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Отмена</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setForm(deepClone(defaultLandingContent));
                  setConfirmReset(false);
                  setSavedNote(null);
                  setError(null);
                }}
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
