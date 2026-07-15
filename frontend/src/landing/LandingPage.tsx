import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { defaultLandingContent, mergeLandingContent, type LandingContent } from './content';
import Icon from '../components/Icon';
import { mountHeroNetworkCanvas } from './heroNetworkCanvas';
import { mountScrollReveal } from './scrollReveal';

/**
 * Обёртка раздела: возвращает null, когда раздел скрыт в редакторе
 * (content.hidden[...] === true). Скрытый раздел не попадает в DOM — не просто
 * прячется через display:none, а полностью исключается из вёрстки.
 */
function Hideable({ hidden, children }: { hidden?: boolean; children: ReactNode }) {
  return hidden ? null : <>{children}</>;
}

/**
 * Публичный лендинг «Модуль устранения потерь».
 * Смонтирован как отдельный Vite-вход (frontend/landing.html →
 * src/landing/main.tsx), по аналогии с клиентским порталом. Бэкенд отдаёт
 * собранный dist/landing.html на корне домена, а SPA живёт под /app
 * (BrowserRouter basename="/app"). Поэтому App.tsx этот компонент не роутит.
 *
 * Дизайн: тёмный анимированный герой (canvas-«плата», см. heroNetworkCanvas.ts)
 * + карточные секции дизайн-системы ШЕФ (icon-tile карточки, таймлайн, roadmap,
 * FAQ-гармошка, финальный CTA с формой). Появление секций — scroll-reveal
 * (scrollReveal.ts), с уважением к prefers-reduced-motion.
 *
 * Текст: весь редактируемый текст вынесен в ./content.ts и НЕ хардкодится здесь.
 * На старте показываем вшитые дефолты (defaultLandingContent), затем подтягиваем
 * сохранённый текст из GET /api/landing/content и сливаем поверх дефолтов
 * (mergeLandingContent). Если запрос не удался — остаёмся на дефолтах, страница
 * не «белеет». Правится текст из приложения (src/pages/LandingEditorPage.tsx).
 * Иконки на карточках — чисто презентационный слой (в контенте их нет): берутся
 * из фиксированных наборов по индексу пункта (циклично, устойчиво к числу
 * пунктов).
 *
 * Стили: токены дизайн-системы (var(--*)) уже есть в styles.css; здесь только
 * лендинг-специфичные классы .lp-* в одном <style>-блоке + глобальные классы
 * (.eyebrow, .btn*, .form-*, .pill*).
 *
 * showPrice / stickyBar — обычные пропсы с дефолтом true (раньше «тумблеры»).
 */

interface LandingPageProps {
  showPrice?: boolean;
  stickyBar?: boolean;
}

// Наборы иконок по секциям — презентационные, не редактируются (в контенте
// иконок нет). Берём циклично по индексу: at(icons, i).
const PAIN_ICONS = ['help', 'chat', 'chart', 'users', 'gear', 'clock'];
const OUTCOME_ICONS = ['users', 'check', 'chart', 'trendUp', 'gear', 'sparkle'];
const INCLUDE_ICONS = ['search', 'chart', 'bolt', 'check', 'gear', 'clock', 'trendUp'];
const BLOCK_ICONS = ['chart', 'users', 'gear', 'sparkle', 'trendUp', 'bolt'];
const CHANGE_ICONS = ['users', 'check', 'chart', 'book', 'arrowRight'];

const at = (arr: string[], i: number) => arr[i % arr.length];

// Инлайн-стиль stagger-задержки для scroll-reveal (--d читает CSS правило
// [data-reveal].is-visible). Кастомную CSS-переменную TS в CSSProperties не
// пускает — каст обязателен.
const revealDelay = (i: number, step = 0.07): CSSProperties =>
  ({ ['--d']: `${(i * step).toFixed(2)}s` } as CSSProperties);

// Версия (редакция) политики обработки ПДн, с которой соглашается пользователь.
// ВАЖНО: держать в синхроне с датой редакции в frontend/public/privacy.html.
const PRIVACY_POLICY_VERSION = '2026-07-07';

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 17,
  letterSpacing: '-.02em',
  lineHeight: 1.25,
};
const cardTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
};
const proseStyle: CSSProperties = {
  margin: '16px 0 0',
  fontSize: 16,
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
};

// Заголовок колонки кейса («Было» / «Что изменили» / «Результат…»).
const caseColHead = (color: string): CSSProperties => ({
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color,
});

// Icon-tile строка чек-листа (.lp-feat): плитка с иконкой + текст.
function FeatRow({ icon, text, index }: { icon: string; text: string; index: number }) {
  return (
    <div className="lp-feat" data-reveal style={revealDelay(index, 0.06)}>
      <div className="lp-tile" style={{ width: 34, height: 34, borderRadius: 10 }}>
        <Icon name={icon} size={16} />
      </div>
      <p style={{ fontSize: 15.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>{text}</p>
    </div>
  );
}

// «Было»/«Стало» в карточке-кейсе. Текст правится в редакторе как многострочный
// (textarea), поэтому пункты разделены переводами строк. В обычном <p> переводы
// схлопываются в пробел и всё сливается в сплошной текст — здесь режем по строкам
// и рендерим как визуальные пункты. Одна строка → обычный абзац; несколько →
// маркированный список. Ведущие маркеры («—», «•», «-», «*», «1.»), если их ввели
// вручную, срезаем, чтобы не задваивать буллеты.
function CaseText({ text, color, strong }: { text: string; color: string; strong?: boolean }) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-–—•*·]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  const base: CSSProperties = { fontSize: 15, lineHeight: 1.55, color, fontWeight: strong ? 600 : undefined };
  if (lines.length <= 1) {
    return <p style={{ margin: '6px 0 0', ...base }}>{lines[0] ?? text}</p>;
  }
  return (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {lines.map((line, i) => (
        <li key={i} style={{ display: 'flex', gap: 9, ...base }}>
          <span aria-hidden style={{ color: 'var(--accent)', flexShrink: 0, lineHeight: 1.55 }}>•</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

// Список пунктов кейса («Кейсы клиентов»): маркированный список с акцентной
// точкой. Пустые строки отсекаем (страховка от «хвостов» из редактора).
function CasePointList({ points, color, strong }: { points: string[]; color: string; strong?: boolean }) {
  return (
    <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {points.filter((p) => p.trim()).map((p, i) => (
        <li key={i} style={{ display: 'flex', gap: 9, fontSize: 14.5, lineHeight: 1.5, color, fontWeight: strong ? 600 : undefined }}>
          <span aria-hidden style={{ color: 'var(--accent)', flexShrink: 0, lineHeight: 1.5 }}>•</span>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

// Абзацы вступления блока «Диагностика»: каждая непустая строка (перенос в
// редакторе) — отдельный абзац. Пустые строки отсекаем.
function DiagProse({ text }: { text: string }) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((line, i) => (
        <p
          key={i}
          style={{ margin: i === 0 ? 0 : '10px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' }}
        >
          {line}
        </p>
      ))}
    </>
  );
}

// Список пунктов блока «Диагностика»: маркированный список в две колонки
// (схлопывается в одну на узких экранах через .lp-diag-points). Пустые пункты
// отсекаем — страховка от «хвостов» из редактора.
function DiagBullets({ items }: { items: string[] }) {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  return (
    <ul className="lp-diag-points" style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
      {clean.map((p, i) => (
        <li key={i} style={{ display: 'flex', gap: 9, fontSize: 14.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          <span aria-hidden style={{ color: 'var(--accent)', flexShrink: 0, lineHeight: 1.5 }}>•</span>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

// ── «Манифест Подхода»: пункты + красные слова-отрицания ──
// Слова, обозначающие отсутствие/отказ («никаких», «нет», «без», «не» …),
// подсвечиваем красным (просьба клиента). Список закрытый, сопоставление по
// нижнему регистру, исходный регистр слова сохраняется.
const NEGATION_WORDS = new Set([
  'никаких', 'никакой', 'никакие', 'никак', 'нет', 'без', 'не',
  'невозможно', 'невозможен', 'невозможна', 'невозможны',
]);

// Границу слова считаем по букве Юникода: \b в JS для кириллицы ненадёжен, а
// lookbehind не поддерживается в старых Safari. Поэтому идём по совпадениям слов
// через exec и сами склеиваем красные и обычные сегменты.
const WORD_RE = /\p{L}+/gu;

function highlightNegations(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    const word = m[0];
    if (!NEGATION_WORDS.has(word.toLowerCase())) continue;
    // «не один год» — устойчивый оборот «много лет», а не отрицание: не красим.
    const rest = text.slice(m.index + word.length);
    if (word.toLowerCase() === 'не' && /^\s+один(?!\p{L})/iu.test(rest)) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={key++} className="lp-neg">
        {word}
      </span>,
    );
    last = m.index + word.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Абзац «Подхода», где каждый перенос строки — отдельный пункт списка, а слова-
// отрицания подсвечены красным. Одна строка (нет переносов) — обычный абзац,
// поэтому вшитый дефолт content.ts (текст без \n) выглядит как раньше.
function ManifestoProse({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return <p style={proseStyle}>{highlightNegations(text)}</p>;
  }
  return (
    <ul className="lp-manifesto">
      {lines.map((line, i) => (
        <li key={i}>
          <span className="lp-manifesto-dot" aria-hidden />
          <span>{highlightNegations(line)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LandingPage({ showPrice = true, stickyBar = true }: LandingPageProps) {
  const [content, setContent] = useState<LandingContent>(defaultLandingContent);
  const [sent, setSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Модалка «Диагностика»: открывается кликом по интерактивной карточке
  // «Диагностика и выбор управленческого блока» в разделе «Как это работает».
  const [diagOpen, setDiagOpen] = useState(false);

  const heroSectionRef = useRef<HTMLElement>(null);
  const heroCanvasRef = useRef<HTMLCanvasElement>(null);

  // Подтягиваем сохранённый текст лендинга и сливаем поверх дефолтов. Любая
  // ошибка (нет текста, сеть, БД недоступна) — тихо остаёмся на дефолтах.
  useEffect(() => {
    let alive = true;
    const base = import.meta.env.VITE_API_URL ?? '';
    fetch(`${base}/api/landing/content`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (alive && json && json.data) {
          setContent(mergeLandingContent(defaultLandingContent, json.data));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const c = content;

  // Анимированный canvas-фон героя. Пересобираем при смене видимости героя
  // (скрыт в редакторе → размонтирован → refs null → dispose). reduced-motion:
  // модуль рисует один статичный кадр без RAF-цикла.
  useEffect(() => {
    if (c.hidden.hero) return;
    const canvas = heroCanvasRef.current;
    const section = heroSectionRef.current;
    if (!canvas || !section) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return mountHeroNetworkCanvas(canvas, section, { reducedMotion: reduced });
  }, [c.hidden.hero]);

  // Scroll-reveal. Перезапускаем при смене контента: после мерджа из БД React
  // может добавить/убрать [data-reveal]-узлы — новый observer охватит текущие.
  useEffect(() => {
    return mountScrollReveal();
  }, [content]);

  // Модалка «Диагностика»: закрытие по Escape + блокировка прокрутки фона.
  useEffect(() => {
    if (!diagOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDiagOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [diagOpen]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Согласие на обработку ПДн обязательно (152-ФЗ): без него не отправляем.
    if (!agreed || sending) return;
    const form = e.currentTarget;
    const val = (id: string) =>
      (form.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';
    const payload = {
      name: val('lead-name').trim(),
      contact: val('lead-phone').trim(),
      note: val('lead-note').trim() || null,
      consent: true,
      consent_at: new Date().toISOString(),
      policy_version: PRIVACY_POLICY_VERSION,
      source: typeof window !== 'undefined' ? window.location.pathname : null,
      website: val('lead-website'),
    };
    setSending(true);
    setError(null);
    try {
      const base = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${base}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSent(true);
    } catch {
      setError(c.cta.error);
    } finally {
      setSending(false);
    }
  }

  // Строка стат-полосы «Продукт» (формат/стоимость/для кого/результат).
  const facts = [
    { icon: 'clock', label: c.product.formatLabel, value: c.product.formatValue, accent: false },
    showPrice
      ? { icon: 'chart', label: c.product.priceLabel, value: c.product.priceValue, accent: false }
      : null,
    { icon: 'users', label: c.product.audienceLabel, value: c.product.audienceValue, accent: false },
    { icon: 'trendUp', label: c.product.resultLabel, value: c.product.resultValue, accent: true },
  ].filter(Boolean) as { icon: string; label: string; value: string; accent: boolean }[];

  const metricCols = `minmax(0,2.2fr) repeat(${Math.max(
    c.proof.metricsHead.length - 1,
    1,
  )}, minmax(0,1fr))`;

  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
        color: 'var(--text-primary)',
        background: 'var(--bg)',
        minHeight: '100vh',
        position: 'relative',
        // Мягкие радиальные подсветки фона страницы (как в референсе).
        backgroundImage:
          'radial-gradient(900px 460px at 82% 0%, rgba(37,99,235,.06), transparent 60%), radial-gradient(700px 420px at 8% 4%, rgba(37,99,235,.045), transparent 55%)',
      }}
    >
      <style>{`
        .lp-wrap { max-width: 900px; margin: 0 auto; padding: 0 32px; }
        .lp-wide { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
        .lp-h2 { font-family: var(--font-display); font-weight: 800; letter-spacing: -.032em; line-height: 1.08; font-size: clamp(28px, 3vw, 38px); color: var(--text-primary); margin: 14px 0 0; }
        .lp-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: var(--transition-spring); will-change: transform; }
        .lp-card.is-hoverable:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
        .lp-num { font-family: var(--font-display); font-weight: 800; font-size: 34px; letter-spacing: -.03em; color: var(--accent); line-height: 1; }
        .lp-tile { flex: none; width: 44px; height: 44px; border-radius: 13px; background: var(--accent-weak); color: var(--accent); display: grid; place-items: center; }

        .lp-feat { display: flex; gap: 16px; align-items: flex-start; padding: 4px 0; }
        .lp-feat p { margin: 0; padding-top: 5px; }

        /* «Манифест Подхода»: пункты с акцентной точкой + красные слова-отрицания */
        .lp-manifesto { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
        .lp-manifesto li { display: flex; gap: 12px; align-items: flex-start; margin: 0; font-size: 16px; line-height: 1.65; color: var(--text-secondary); }
        .lp-manifesto-dot { flex: none; width: 6px; height: 6px; margin-top: 9px; border-radius: 50%; background: var(--accent); }
        .lp-neg { color: var(--danger); font-weight: 700; }

        .lp-band { background: linear-gradient(180deg, var(--surface-2), #fff 82%); }

        /* Таймлайн «Одна рабочая неделя» */
        .lp-tl { position: relative; padding-left: 34px; }
        .lp-tl::before { content: ''; position: absolute; left: 8px; top: 6px; bottom: 6px; width: 2px; background: var(--border-2); }
        .lp-tl-item { position: relative; padding: 0 0 36px; }
        .lp-tl-item:last-child { padding-bottom: 0; }
        .lp-tl-dot { position: absolute; left: -34px; top: 3px; width: 18px; height: 18px; border-radius: 6px; background: #fff; border: 2px solid var(--accent); display: grid; place-items: center; }
        .lp-tl-dot::after { content: ''; width: 6px; height: 6px; border-radius: 2px; background: var(--accent); }

        /* Roadmap «Как это работает»: пунктирный коннектор за карточками */
        .lp-roadmap { position: relative; }
        .lp-roadmap::before { content: ''; position: absolute; left: 6%; right: 6%; top: 23px; height: 2px; background: repeating-linear-gradient(90deg, var(--border-2) 0 8px, transparent 8px 14px); z-index: 0; }
        .lp-week-badge { position: relative; z-index: 1; width: 46px; height: 46px; border-radius: 14px; background: var(--text-primary); color: #fff; display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 17px; box-shadow: var(--shadow-sm); }

        /* Большая декоративная кавычка «Честный разговор» */
        .lp-quote-mark { font-family: var(--font-display); font-weight: 800; font-size: 64px; line-height: 1; color: var(--accent-weak); position: absolute; top: 6px; left: 20px; }

        /* FAQ-гармошка */
        details.lp-faq { border-bottom: 1px solid var(--border); }
        details.lp-faq:first-child { border-top: 1px solid var(--border); }
        details.lp-faq > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 24px 4px; font-family: var(--font-display); font-weight: 700; font-size: 17px; color: var(--text-primary); }
        details.lp-faq > summary::-webkit-details-marker { display: none; }
        details.lp-faq .lp-plus { flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--surface-2); display: grid; place-items: center; position: relative; transition: var(--transition); }
        details.lp-faq .lp-plus::before, details.lp-faq .lp-plus::after { content: ''; position: absolute; background: var(--text-primary); border-radius: 2px; }
        details.lp-faq .lp-plus::before { width: 12px; height: 2px; }
        details.lp-faq .lp-plus::after { width: 2px; height: 12px; transition: transform .2s var(--ease-out); }
        details.lp-faq[open] .lp-plus::after { transform: rotate(90deg); opacity: 0; }
        details.lp-faq[open] .lp-plus { background: var(--accent-weak); }
        details.lp-faq .lp-a { margin: -6px 0 24px; padding-right: 46px; font-size: 15.5px; line-height: 1.65; color: var(--text-secondary); }

        /* «Диагностика»: выпадающие смысловые блоки (карточка-аккордеон) */
        details.lp-diag { border: 1px solid var(--border); border-radius: var(--radius-md); background: #fff; margin-top: 12px; box-shadow: var(--shadow-sm); transition: var(--transition); }
        details.lp-diag[open] { box-shadow: var(--shadow-md); }
        details.lp-diag > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; font-family: var(--font-display); font-weight: 700; font-size: 16.5px; letter-spacing: -.01em; color: var(--text-primary); }
        details.lp-diag > summary::-webkit-details-marker { display: none; }
        details.lp-diag .lp-plus { flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--surface-2); display: grid; place-items: center; position: relative; transition: var(--transition); }
        details.lp-diag .lp-plus::before, details.lp-diag .lp-plus::after { content: ''; position: absolute; background: var(--text-primary); border-radius: 2px; }
        details.lp-diag .lp-plus::before { width: 12px; height: 2px; }
        details.lp-diag .lp-plus::after { width: 2px; height: 12px; transition: transform .2s var(--ease-out); }
        details.lp-diag[open] .lp-plus::after { transform: rotate(90deg); opacity: 0; }
        details.lp-diag[open] .lp-plus { background: var(--accent-weak); }
        details.lp-diag .lp-diag-body { padding: 4px 22px 24px; }
        .lp-diag-points { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }

        /* Интерактивная карточка «Диагностика…» в roadmap */
        .lp-diag-card { cursor: pointer; }
        .lp-diag-card:hover { border-color: var(--accent); }
        .lp-diag-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .lp-diag-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; letter-spacing: -.01em; color: var(--accent); }
        .lp-diag-card:hover .lp-diag-cta { gap: 9px; }

        /* Модалка «Диагностика» */
        @keyframes lpModalFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lpModalRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .lp-modal-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; background: rgba(10,12,18,.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); overflow-y: auto; animation: lpModalFade .2s var(--ease-out) both; }
        .lp-modal { position: relative; width: 100%; max-width: 760px; margin: auto; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-xl); box-shadow: 0 40px 100px -30px rgba(0,0,0,.55); padding: 40px 40px 40px; animation: lpModalRise .28s var(--ease-out) both; }
        .lp-modal-close { position: absolute; top: 16px; right: 16px; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--border); background: #fff; color: var(--text-secondary); display: grid; place-items: center; cursor: pointer; transition: var(--transition); }
        .lp-modal-close:hover { background: var(--surface-2); color: var(--text-primary); }
        @media (prefers-reduced-motion: reduce) { .lp-modal-overlay, .lp-modal { animation: none; } }
        @media (max-width: 560px) { .lp-modal { padding: 34px 20px 32px; } }

        /* Таблица метрик «Измеримость» */
        .lp-metric-row { display: grid; align-items: center; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); }
        .lp-metric-row:first-child { border-top: none; }

        /* scroll-reveal (парно с scrollReveal.ts) */
        [data-reveal] { opacity: 0; }
        [data-reveal].is-visible { animation: fadeInUp .7s var(--ease-out) both; animation-delay: var(--d, 0s); }
        @media (prefers-reduced-motion: reduce) { [data-reveal] { opacity: 1; animation: none; } }

        /* Десктоп-first дизайн: аккуратные схлопывания сеток на узких экранах */
        @media (max-width: 900px) {
          .lp-split { grid-template-columns: 1fr !important; gap: 40px !important; }
          .lp-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-grid-3 { grid-template-columns: 1fr !important; }
          .lp-grid-2 { grid-template-columns: 1fr !important; }
          .lp-facts { grid-template-columns: repeat(2, 1fr) !important; row-gap: 24px; }
          .lp-facts > div { border-left: none !important; padding-left: 0 !important; }
          .lp-roadmap::before { display: none; }
        }
        @media (max-width: 560px) {
          .lp-grid-4 { grid-template-columns: 1fr !important; }
          .lp-facts { grid-template-columns: 1fr !important; }
          .lp-diag-points { grid-template-columns: 1fr !important; }
          .lp-wrap, .lp-wide { padding: 0 20px; }
        }
      `}</style>

      {/* ===== Nav (sticky, стекло) ===== */}
      {stickyBar && (
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 32px',
            background: 'rgba(255,255,255,.78)',
            backdropFilter: 'blur(18px) saturate(180%)',
            WebkitBackdropFilter: 'blur(18px) saturate(180%)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: 'var(--text-primary)',
                clipPath: 'polygon(0 0, 78% 0, 100% 22%, 100% 100%, 0 100%)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  background: 'var(--accent)',
                  clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 15.5,
                letterSpacing: '-.01em',
                color: 'var(--text-primary)',
              }}
            >
              {c.brand}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {/* Вход в приложение: SPA живёт под /app (см. backend serve_spa). */}
            <a href="/app" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {c.nav.login}
            </a>
            <a
              href="#lead"
              className="btn btn-primary btn-sm"
              style={{ boxShadow: 'var(--shadow-blue)' }}
            >
              {c.nav.cta}
            </a>
          </div>
        </nav>
      )}

      {/* ===== Hero (тёмный, анимированный canvas-фон) ===== */}
      <Hideable hidden={c.hidden.hero}>
        <section ref={heroSectionRef} style={{ position: 'relative', overflow: 'hidden', background: '#12141B' }}>
          {/* Слой сетки */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
              backgroundSize: '132px 132px',
              pointerEvents: 'none',
            }}
          />
          {/* Анимированная «плата» */}
          <canvas ref={heroCanvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
          {/* Затемнение к низу */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 45%, #12141B 100%)',
              pointerEvents: 'none',
            }}
          />

          <div className="lp-wrap" style={{ position: 'relative', zIndex: 1, padding: '108px 32px 96px' }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.55)' }}>
              {c.hero.eyebrow}
            </div>
            <h1
              style={{
                margin: '22px 0 0',
                maxWidth: 820,
                color: '#fff',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 'clamp(38px, 5vw, 60px)',
                lineHeight: 0.98,
                letterSpacing: '-.045em',
              }}
            >
              {c.hero.title}
            </h1>
            {/* Стеклянная стат-карточка + поддерживающий абзац (subtitle1) в
                один ряд. Карточку прячем, если значение пустое (правится в
                редакторе). */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 28,
                flexWrap: 'wrap',
                marginTop: 34,
              }}
            >
              {c.hero.statValue && (
                <div
                  style={{
                    padding: '22px 26px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    minWidth: 260,
                    background: 'rgba(255,255,255,.06)',
                    backdropFilter: 'blur(18px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                    border: '1px solid rgba(255,255,255,.12)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 24px 60px -24px rgba(0,0,0,.6)',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>
                    {c.hero.statLabel}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, letterSpacing: '-.03em', color: '#fff' }}>
                    {c.hero.statValue}
                    {c.hero.statUnit && (
                      <span style={{ color: 'rgba(255,255,255,.55)', fontWeight: 700, fontSize: 16 }}>
                        {' '}
                        {c.hero.statUnit}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <p
                style={{
                  margin: 0,
                  maxWidth: 480,
                  fontSize: 17,
                  lineHeight: 1.65,
                  color: 'rgba(255,255,255,.66)',
                  fontWeight: 500,
                }}
              >
                {c.hero.subtitle1}
              </p>
            </div>
            <p
              style={{
                margin: '28px 0 0',
                maxWidth: 620,
                fontSize: 17,
                lineHeight: 1.65,
                color: 'rgba(255,255,255,.62)',
                fontWeight: 500,
              }}
            >
              {c.hero.subtitle2}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                flexWrap: 'wrap',
                marginTop: 34,
              }}
            >
              <a
                href="#lead"
                className="btn btn-primary"
                style={{
                  padding: '0.95rem 1.9rem',
                  fontSize: '1rem',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-blue)',
                }}
              >
                {c.hero.ctaButton}
              </a>
              <span
                style={{
                  fontSize: 13.5,
                  maxWidth: 340,
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,.45)',
                }}
              >
                {c.hero.ctaNote}
              </span>
            </div>
          </div>
        </section>
      </Hideable>

      {/* ===== Знакомая картина (боль) ===== */}
      <Hideable hidden={c.hidden.pain}>
        <section className="lp-wrap" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.pain.eyebrow}</div>
          <h2 className="lp-h2">{c.pain.title}</h2>
          <p style={{ margin: '22px 0 0', fontSize: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {c.pain.intro}
          </p>
          <div
            className="lp-grid-2"
            style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}
          >
            {c.pain.points.map((text, i) => (
              <div
                key={i}
                className="lp-card is-hoverable"
                data-reveal
                style={{ ...revealDelay(i), padding: '22px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}
              >
                <div className="lp-tile">
                  <Icon name={at(PAIN_ICONS, i)} size={20} />
                </div>
                <p style={{ margin: 0, paddingTop: 3, fontSize: 15.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
          <p style={{ margin: '40px 0 0', fontSize: 20, fontWeight: 700, lineHeight: 1.5, color: 'var(--text-primary)', maxWidth: 720 }}>
            {c.pain.outroBold}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--text-secondary)' }}>{c.pain.outroText}</p>
        </section>
      </Hideable>

      {/* ===== Одна рабочая неделя (таймлайн) ===== */}
      <Hideable hidden={c.hidden.week}>
        <section className="lp-band" style={{ padding: '128px 0 96px', marginTop: 128 }}>
          <div className="lp-wrap">
            <div className="eyebrow">{c.week.eyebrow}</div>
            <h2 className="lp-h2">{c.week.title}</h2>

            <div className="lp-tl" style={{ marginTop: 44 }}>
              {c.week.scenes.map((scene, i) => (
                <div key={i} className="lp-tl-item" data-reveal style={revealDelay(i, 0.08)}>
                  <span className="lp-tl-dot" />
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.02em', color: 'var(--accent)' }}>
                    {scene.day}
                  </span>
                  <p style={{ margin: '8px 0 0', fontSize: 16.5, lineHeight: 1.65, color: 'var(--text-primary)', maxWidth: 700 }}>
                    {scene.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="lp-card" style={{ marginTop: 12, padding: '26px 28px', background: '#fff' }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {c.week.outro}
              </p>
            </div>
          </div>
        </section>
      </Hideable>

      {/* ===== Подход (2 колонки: проза + чек-лист) ===== */}
      <Hideable hidden={c.hidden.solution}>
        <section className="lp-wide" style={{ padding: '128px 32px 0' }}>
          <div className="lp-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start' }}>
            <div>
              <div className="eyebrow">{c.solution.eyebrow}</div>
              <h2 className="lp-h2">{c.solution.title}</h2>
              <p style={{ ...proseStyle, margin: '22px 0 0' }}>{c.solution.text1}</p>
              <ManifestoProse text={c.solution.text2} />
              <p style={proseStyle}>{c.solution.text3}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 20px', fontSize: 16, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {c.solution.resultIntro}
              </p>
              <div className="lp-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {c.solution.resultItems.map((text, i) => (
                  <FeatRow key={i} icon={at(OUTCOME_ICONS, i)} text={text} index={i} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </Hideable>

      {/* ===== Как это работает (roadmap) ===== */}
      <Hideable hidden={c.hidden.how}>
        <section className="lp-wide" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.how.eyebrow}</div>
          <h2 className="lp-h2" style={{ maxWidth: 900 }}>
            {c.how.title}
          </h2>

          <div
            className="lp-roadmap lp-grid-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22, marginTop: 44 }}
          >
            {c.how.steps.map((step, i) => {
              const points = step.points && step.points.length > 0 ? step.points : step.text ? [step.text] : [];
              // Первый шаг («Диагностика…») — интерактивная карточка: клик
              // открывает модалку с подробностями диагностики. Остальные шаги
              // статичны. Прячем интерактив, если раздел «Диагностика» убран.
              const interactive = i === 0 && !c.hidden.diagnostics;
              return (
                <div
                  key={i}
                  className={`lp-card is-hoverable${interactive ? ' lp-diag-card' : ''}`}
                  data-reveal
                  onClick={interactive ? () => setDiagOpen(true) : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDiagOpen(true);
                          }
                        }
                      : undefined
                  }
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-haspopup={interactive ? 'dialog' : undefined}
                  style={{
                    ...revealDelay(i, 0.09),
                    padding: '22px 22px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    cursor: interactive ? 'pointer' : undefined,
                  }}
                >
                  <div className="lp-week-badge">{i + 1}</div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {step.week}
                  </span>
                  <h3 style={{ ...cardTitleStyle, fontSize: 18 }}>{step.title}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 2 }}>
                    {points.map((point, j) => (
                      <div key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ flex: 'none', width: 6, height: 6, marginTop: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{point}</p>
                      </div>
                    ))}
                  </div>
                  {interactive && (
                    <span className="lp-diag-cta" style={{ marginTop: 'auto', paddingTop: 4 }}>
                      {c.diagnostics.cardCta}
                      <Icon name="arrowRight" size={15} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </Hideable>

      {/* ===== Продукт (стат-полоса + что входит) ===== */}
      <Hideable hidden={c.hidden.product}>
        <section className="lp-wrap" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.product.eyebrow}</div>
          <h2 className="lp-h2">{c.product.title}</h2>
          <p style={{ margin: '22px 0 0', maxWidth: 680, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {c.product.intro}
          </p>

          <div
            className="lp-card lp-facts"
            style={{ marginTop: 32, padding: '30px 32px', display: 'grid', gridTemplateColumns: `repeat(${facts.length}, 1fr)`, gap: 8 }}
          >
            {facts.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: i === 0 ? '0 20px 0 0' : '0 20px',
                  borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <div className="lp-tile" style={{ width: 34, height: 34, borderRadius: 10, marginBottom: 12 }}>
                  <Icon name={f.icon} size={16} />
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: f.accent ? 'var(--accent)' : 'var(--ink-3)' }}>
                  {f.label}
                </div>
                <div style={{ marginTop: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: f.accent ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '44px 0 0', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-.03em' }}>
            {c.product.includedTitle}
          </h3>
          <div className="lp-card" style={{ marginTop: 18, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {c.product.included.map((text, i) => (
              <FeatRow key={i} icon={at(INCLUDE_ICONS, i)} text={text} index={i} />
            ))}
          </div>
        </section>
      </Hideable>

      {/* ===== Первый блок (3-колоночные карточки + инструменты) ===== */}
      <Hideable hidden={c.hidden.blocks}>
        <section className="lp-wide" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.blocks.eyebrow}</div>
          <h2 className="lp-h2">{c.blocks.title}</h2>

          <div
            className="lp-grid-3"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 44 }}
          >
            {c.blocks.items.map((block, i) => (
              <div
                key={i}
                className="lp-card is-hoverable"
                data-reveal
                style={{ ...revealDelay(i), padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <div className="lp-tile">
                  <Icon name={at(BLOCK_ICONS, i)} size={20} />
                </div>
                <h3 style={cardTitleStyle}>{block.title}</h3>
                <p style={cardTextStyle}>{block.text}</p>
              </div>
            ))}
          </div>

          <div className="lp-card" style={{ marginTop: 28, padding: '28px 30px', background: 'var(--surface-2)', border: 'none' }}>
            <h3 style={cardTitleStyle}>{c.blocks.toolsTitle}</h3>
            <p style={{ margin: '10px 0 0', fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)', maxWidth: 800 }}>
              {c.blocks.toolsText}
            </p>
          </div>
        </section>
      </Hideable>

      {/* ===== Почему это работает (принципы + что меняется) ===== */}
      <Hideable hidden={c.hidden.why}>
        <section className="lp-wide" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.why.eyebrow}</div>
          <h2 className="lp-h2">{c.why.title}</h2>

          <div
            className="lp-grid-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, marginTop: 44 }}
          >
            {c.why.items.map((item, i) => (
              <div key={i}>
                <div className="lp-num">{item.num}</div>
                <h3 style={{ ...cardTitleStyle, margin: '14px 0 0' }}>{item.title}</h3>
                <p style={{ ...cardTextStyle, margin: '10px 0 0' }}>{item.text}</p>
              </div>
            ))}
          </div>

          <div
            className="lp-split"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, marginTop: 72, paddingTop: 56, borderTop: '1px solid var(--border)', alignItems: 'start' }}
          >
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-.03em' }}>
                {c.why.afterTitle}
              </h3>
              <p style={proseStyle}>{c.why.afterText1}</p>
              <p style={{ ...proseStyle, margin: '14px 0 0' }}>{c.why.afterText2}</p>
            </div>
            <div className="lp-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {c.why.afterLines.map((text, i) => (
                <FeatRow key={i} icon={at(CHANGE_ICONS, i)} text={text} index={i} />
              ))}
            </div>
          </div>
        </section>
      </Hideable>

      {/* ===== Измеримость / метрики ===== */}
      <Hideable hidden={c.hidden.proof}>
        <section className="lp-wrap" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.proof.eyebrow}</div>
          <h2 className="lp-h2">{c.proof.title}</h2>
          <p style={{ margin: '22px 0 0', fontSize: 16, color: 'var(--text-secondary)' }}>{c.proof.intro}</p>

          <div className="lp-card" style={{ marginTop: 32, overflow: 'hidden' }}>
            <div
              className="lp-metric-row"
              style={{ gridTemplateColumns: metricCols, background: 'var(--surface-2)' }}
            >
              {c.proof.metricsHead.map((h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    textAlign: i === 0 ? 'left' : 'right',
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
            {c.proof.metricsRows.map((row, ri) => (
              <div key={ri} className="lp-metric-row" style={{ gridTemplateColumns: metricCols }}>
                <span style={{ fontSize: 14.5, color: 'var(--text-primary)' }}>{row.label}</span>
                {row.values.map((v, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 14.5,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: i === row.values.length - 1 ? 700 : 500,
                      color: i === row.values.length - 1 ? 'var(--success)' : 'var(--text-secondary)',
                    }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{c.proof.groupsIntro}</p>
            <div
              className="lp-grid-4"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 20 }}
            >
              {c.proof.groups.map((g, i) => (
                <div key={i}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {g.title}
                  </span>
                  <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{g.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Hideable>

      {/* ===== С чем приходят (ситуации) ===== */}
      <Hideable hidden={c.hidden.situations}>
        <section className="lp-band" style={{ padding: '128px 0 96px', marginTop: 128 }}>
          <div className="lp-wide">
            <div className="eyebrow">{c.situations.eyebrow}</div>
            <h2 className="lp-h2">{c.situations.title}</h2>

            <div
              className="lp-grid-2"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginTop: 44 }}
            >
              {c.situations.items.map((s, i) => (
                <div
                  key={i}
                  className="lp-card is-hoverable"
                  data-reveal
                  style={{ ...revealDelay(i, 0.08), padding: '26px', display: 'flex', gap: 20, alignItems: 'flex-start', background: '#fff' }}
                >
                  <div className="lp-num" style={{ fontSize: 26, color: 'var(--ink-4)' }}>
                    {s.num}
                  </div>
                  <div>
                    <h3 style={cardTitleStyle}>{s.title}</h3>
                    <p style={{ ...cardTextStyle, margin: '10px 0 0', fontSize: 15 }}>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Легаси-блок «Кейсы: было / стало» — карточки с отраслью и метрикой.
                По умолчанию скрыт (hidden.legacyCases), заменён развёрнутым блоком
                «Кейсы клиентов» ниже. Текст остаётся правимым в конструкторе.
                Скрыт также, если все кейсы удалены в редакторе. */}
            {!c.hidden.legacyCases && c.situations.casesItems.length > 0 && (
              <div style={{ marginTop: 64, paddingTop: 48, borderTop: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-.03em' }}>
                  {c.situations.casesRowTitle}
                </h3>
                {c.situations.casesRowIntro && (
                  <p style={{ margin: '16px 0 0', maxWidth: 680, fontSize: 16, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                    {c.situations.casesRowIntro}
                  </p>
                )}
                <div
                  className="lp-grid-3"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 32 }}
                >
                  {c.situations.casesItems.map((cs, i) => (
                    <div
                      key={i}
                      className="lp-card is-hoverable"
                      data-reveal
                      style={{ ...revealDelay(i, 0.08), padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 18, background: '#fff' }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignSelf: 'flex-start',
                          padding: '6px 12px',
                          borderRadius: 999,
                          background: 'var(--accent-weak)',
                          color: 'var(--accent)',
                          fontSize: 12.5,
                          fontWeight: 700,
                        }}
                      >
                        {cs.industry}
                      </span>
                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                          Было
                        </div>
                        <CaseText text={cs.before} color="var(--text-secondary)" />
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                          Стало
                        </div>
                        <CaseText text={cs.after} color="var(--text-primary)" strong />
                      </div>
                      {(cs.metric || cs.metricLabel) && (
                        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span className="lp-num" style={{ fontSize: 22 }}>{cs.metric}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{cs.metricLabel}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Легаси «Если нужны кейсы» — под тем же флагом legacyCases. */}
            {!c.hidden.legacyCases && (
              <div
                className="lp-split"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, marginTop: 64, paddingTop: 48, borderTop: '1px solid var(--border)', alignItems: 'start' }}
              >
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-.03em' }}>
                    {c.situations.casesTitle}
                  </h3>
                  <p style={proseStyle}>{c.situations.casesText1}</p>
                  <p style={{ margin: '16px 0 0', fontSize: 17, fontWeight: 700, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                    {c.situations.casesText2}
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                    {c.situations.casesRight}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </Hideable>

      {/* ===== Кейсы клиентов (было / что изменили / результат) ===== */}
      <Hideable hidden={c.hidden.cases}>
        <section className="lp-wide" style={{ padding: '120px 32px 0' }}>
          <div className="eyebrow">{c.cases.eyebrow}</div>
          <h2 className="lp-h2">{c.cases.title}</h2>
          {c.cases.intro && (
            <p style={{ ...proseStyle, maxWidth: 760 }}>{c.cases.intro}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 44 }}>
            {c.cases.items.map((cs, i) => (
              <div
                key={i}
                className="lp-card"
                data-reveal
                style={{ ...revealDelay(i, 0.06), padding: '30px 30px 34px', background: '#fff' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span className="lp-num" style={{ fontSize: 22, color: 'var(--ink-4)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-.03em' }}>
                    {cs.title}
                  </h3>
                </div>
                <div
                  className="lp-grid-3"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, marginTop: 24 }}
                >
                  <div style={{ borderTop: '2px solid var(--border-2)', paddingTop: 14 }}>
                    <div style={caseColHead('var(--ink-3)')}>Было</div>
                    <CasePointList points={cs.beforePoints} color="var(--text-secondary)" />
                  </div>
                  <div style={{ borderTop: '2px solid var(--border-2)', paddingTop: 14 }}>
                    <div style={caseColHead('var(--text-primary)')}>Что изменили</div>
                    <CasePointList points={cs.changedPoints} color="var(--text-primary)" />
                  </div>
                  <div style={{ borderTop: '2px solid var(--accent)', paddingTop: 14 }}>
                    <div style={caseColHead('var(--accent)')}>{cs.resultTitle}</div>
                    <CasePointList points={cs.resultPoints} color="var(--text-primary)" strong />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Hideable>

      {/* ===== Честный разговор (возражения) ===== */}
      <Hideable hidden={c.hidden.objections}>
        <section className="lp-wrap" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.objections.eyebrow}</div>
          <h2 className="lp-h2">{c.objections.title}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 40 }}>
            {c.objections.items.map((o, i) => (
              <div
                key={i}
                className="lp-card is-hoverable"
                data-reveal
                style={{ ...revealDelay(i), padding: '30px 30px 26px', position: 'relative', overflow: 'hidden' }}
              >
                <span className="lp-quote-mark">&ldquo;</span>
                <p style={{ margin: 0, paddingLeft: 34, fontSize: 17.5, fontWeight: 700, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  {o.q}
                </p>
                <p style={{ margin: '14px 0 0', paddingLeft: 34, fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                  {o.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </Hideable>

      {/* ===== FAQ ===== */}
      <Hideable hidden={c.hidden.faq}>
        <section className="lp-wrap" style={{ padding: '128px 32px 0' }}>
          <div className="eyebrow">{c.faq.eyebrow}</div>
          <h2 className="lp-h2" style={{ fontSize: 'clamp(32px, 3.4vw, 42px)' }}>
            {c.faq.title}
          </h2>

          <div style={{ marginTop: 32 }}>
            {c.faq.items.map((item, i) => (
              <details key={i} className="lp-faq">
                <summary>
                  <span>{item.q}</span>
                  <span className="lp-plus" />
                </summary>
                <p className="lp-a">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </Hideable>

      {/* ===== Финальный CTA + форма заявки ===== */}
      <Hideable hidden={c.hidden.cta}>
        <section id="lead" className="lp-wide" style={{ padding: '140px 32px 0', scrollMarginTop: 80 }}>
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              padding: '56px 48px',
              background:
                'radial-gradient(720px 360px at 50% 0%, rgba(37,99,235,.10), transparent 65%), var(--surface-2)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div
              className="lp-split"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'start' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="eyebrow">{c.cta.eyebrow}</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '-.035em', lineHeight: 1.05, margin: 0 }}>
                  {c.cta.title}
                </h2>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{c.cta.text}</p>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>{c.cta.note}</p>
              </div>

              <div
                style={{
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 28,
                  background: 'var(--card-bg)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {!sent ? (
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="form-label" htmlFor="lead-name" style={{ margin: 0 }}>
                        {c.cta.nameLabel}
                      </label>
                      <input className="form-input" id="lead-name" type="text" placeholder={c.cta.namePlaceholder} required />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="form-label" htmlFor="lead-phone" style={{ margin: 0 }}>
                        {c.cta.phoneLabel}
                      </label>
                      <input className="form-input" id="lead-phone" type="text" placeholder={c.cta.phonePlaceholder} required />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="form-label" htmlFor="lead-note" style={{ margin: 0 }}>
                        {c.cta.noteLabel}
                      </label>
                      <textarea className="form-textarea" id="lead-note" placeholder={c.cta.notePlaceholder} style={{ minHeight: 88 }} />
                    </div>
                    {/* Honeypot: скрыт от людей, приманка для ботов. Не удалять. */}
                    <input
                      type="text"
                      id="lead-website"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                    />
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      <span>
                        {c.cta.consentPrefix}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>
                          {c.cta.consentLink}
                        </a>
                        {c.cta.consentSuffix}
                      </span>
                    </label>
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={!agreed || sending}
                      style={{ padding: '14px 24px', fontSize: 16, borderRadius: 'var(--radius-md)', opacity: agreed && !sending ? 1 : 0.5, cursor: agreed && !sending ? 'pointer' : 'not-allowed' }}
                    >
                      {sending ? c.cta.submitSending : c.cta.submit}
                    </button>
                    {error && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--danger, #e23d32)' }}>{error}</p>}
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
                    <span className="pill pill-green">
                      <span className="led" />
                      {c.cta.successTitle}
                    </span>
                    <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{c.cta.successText}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </Hideable>

      <footer
        className="lp-wide"
        style={{ marginTop: 88, padding: '32px 32px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{c.footer.brand}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{c.footer.tagline}</span>
      </footer>

      {/* ===== Модалка «Диагностика» — открывается из карточки «Как это работает» ===== */}
      {diagOpen && !c.hidden.diagnostics && (
        <div
          className="lp-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDiagOpen(false);
          }}
        >
          <div className="lp-modal" role="dialog" aria-modal="true" aria-label={c.diagnostics.title}>
            <button type="button" className="lp-modal-close" onClick={() => setDiagOpen(false)} aria-label="Закрыть">
              <Icon name="close" size={18} />
            </button>

            <div className="eyebrow">{c.diagnostics.eyebrow}</div>
            <h2 style={{ margin: '12px 0 0', paddingRight: 40, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(24px, 3vw, 30px)', letterSpacing: '-.03em', lineHeight: 1.12, color: 'var(--text-primary)' }}>
              {c.diagnostics.title}
            </h2>

            {/* Стоимость + срок */}
            <div className="lp-card" style={{ marginTop: 26, padding: '24px 26px', boxShadow: 'none' }}>
              <div className="lp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                    {c.diagnostics.priceLabel}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '-.03em', color: 'var(--accent)' }}>
                    {c.diagnostics.priceValue}
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                    {c.diagnostics.termLabel}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text-primary)' }}>
                    {c.diagnostics.termValue}
                  </div>
                </div>
              </div>
              {c.diagnostics.priceNote && (
                <p style={{ margin: '18px 0 0', paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {c.diagnostics.priceNote}
                </p>
              )}
            </div>

            {/* Цель диагностики */}
            <div style={{ marginTop: 32 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-.03em' }}>
                {c.diagnostics.goalTitle}
              </h3>
              <p style={{ ...proseStyle, fontSize: 15 }}>{c.diagnostics.goalText1}</p>
              <p style={{ ...proseStyle, fontSize: 15, margin: '12px 0 0' }}>{c.diagnostics.goalText2}</p>
            </div>

            {/* Что входит — выпадающие блоки */}
            <h3 style={{ margin: '32px 0 0', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-.03em' }}>
              {c.diagnostics.includedTitle}
            </h3>
            <div style={{ marginTop: 14 }}>
              {c.diagnostics.items.map((item, i) => {
                const resultLines = item.result.split('\n').map((s) => s.trim()).filter(Boolean);
                return (
                  <details key={i} className="lp-diag">
                    <summary>
                      <span>{item.title}</span>
                      <span className="lp-plus" />
                    </summary>
                    <div className="lp-diag-body">
                      <DiagProse text={item.intro} />
                      <DiagBullets items={item.points} />
                      {item.subIntro && (
                        <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                          {item.subIntro}
                        </p>
                      )}
                      {item.subPoints && item.subPoints.length > 0 && <DiagBullets items={item.subPoints} />}
                      {item.note && (
                        <p style={{ margin: '16px 0 0', fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-primary)', fontWeight: 600 }}>
                          {item.note}
                        </p>
                      )}
                      {resultLines.length > 0 && (
                        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'var(--accent-weak)', borderLeft: '3px solid var(--accent)' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                            {c.diagnostics.resultLabel}
                          </span>
                          {resultLines.length > 1 ? (
                            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {resultLines.map((line, j) => (
                                <li key={j} style={{ display: 'flex', gap: 9, fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                                  <span aria-hidden style={{ color: 'var(--accent)', flexShrink: 0, lineHeight: 1.55 }}>•</span>
                                  <span>{line}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                              {resultLines[0]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
              <a href="#lead" className="btn btn-primary btn-sm" onClick={() => setDiagOpen(false)} style={{ boxShadow: 'var(--shadow-blue)' }}>
                {c.nav.cta}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
