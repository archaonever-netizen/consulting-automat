import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { defaultLandingContent, mergeLandingContent, type LandingContent } from './content';

/**
 * Публичный лендинг «Модуль устранения потерь».
 * Смонтирован как отдельный Vite-вход (frontend/landing.html →
 * src/landing/main.tsx), по аналогии с клиентским порталом. Бэкенд отдаёт
 * собранный dist/landing.html на корне домена, а SPA живёт под /app
 * (BrowserRouter basename="/app"). Поэтому App.tsx этот компонент не роутит.
 *
 * Текст: весь редактируемый текст вынесен в ./content.ts. На старте показываем
 * вшитые дефолты (defaultLandingContent), затем подтягиваем сохранённый текст
 * из GET /api/landing/content и сливаем поверх дефолтов (mergeLandingContent).
 * Если запрос не удался — остаёмся на дефолтах, страница не «белеет». Правится
 * текст из приложения (раздел «Лендинг», src/pages/LandingEditorPage.tsx).
 *
 * Стили: использует существующие глобальные классы из styles.css
 * (.eyebrow, .btn/.btn-primary/.btn-sm, .form-input/.form-textarea/.form-label,
 * .pill/.pill-green, .clients-table/.ct-row) + инлайн-стили на переменных
 * дизайн-системы (var(--*)) для остального разметки, специфичной для лендинга.
 *
 * showPrice / stickyBar — единственные два переключателя, которые раньше были
 * "тумблерами" в дизайн-инструменте; здесь это обычные пропсы с дефолтом true.
 */

interface LandingPageProps {
  showPrice?: boolean;
  stickyBar?: boolean;
}

const h2Style: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 'clamp(28px, 3.6vw, 40px)',
  letterSpacing: '-.035em',
  lineHeight: 1.05,
  margin: 0,
};
const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 18,
  letterSpacing: '-.02em',
  lineHeight: 1.2,
};
const cardTextStyle: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' };

const factLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
};
const factValueStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 19,
  letterSpacing: '-.02em',
};

// Версия (редакция) политики обработки ПДн, с которой соглашается пользователь.
// ВАЖНО: держать в синхроне с датой редакции в frontend/public/privacy.html.
// При каждом изменении текста политики — обновлять здесь и там.
const PRIVACY_POLICY_VERSION = '2026-07-07';

export default function LandingPage({ showPrice = true, stickyBar = true }: LandingPageProps) {
  const [content, setContent] = useState<LandingContent>(defaultLandingContent);
  const [sent, setSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Фиксация согласия: факт, время клика и версия политики, с которой
      // согласился пользователь — сохраняется в БД вместе с заявкой.
      consent: true,
      consent_at: new Date().toISOString(),
      policy_version: PRIVACY_POLICY_VERSION,
      source: typeof window !== 'undefined' ? window.location.pathname : null,
      // Honeypot: скрытое поле, которое заполняют только боты (реальные
      // пользователи его не видят и оставляют пустым).
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

  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
        color: 'var(--text-primary)',
        background: 'var(--bg)',
        minHeight: '100vh',
      }}
    >
      <style>{`
        .lp-row { border-bottom: 1px solid var(--border); }
        .lp-row:last-child { border-bottom: none; }
        .lp-details > summary { list-style: none; cursor: pointer; }
        .lp-details > summary::-webkit-details-marker { display: none; }
        .lp-details[open] .lp-chev { transform: rotate(45deg); }

        /* Вертикальный «план»: точки, соединённые синей линией (как режим
           планирования в ИИ-чатах). Линия — сплошная var(--accent), рисуется
           псевдоэлементом рельса и стыкуется между пунктами. */
        .lp-plan { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; }
        .lp-plan-item { display: flex; gap: 12px; align-items: stretch; }
        .lp-plan-rail { position: relative; flex: 0 0 10px; }
        .lp-plan-rail::before {
          content: ''; position: absolute; left: 50%; top: 0; bottom: 0;
          width: 2px; transform: translateX(-50%);
          background: var(--accent); border-radius: 2px;
        }
        /* Обрезаем линию до центра крайних точек, чтобы не торчала сверху/снизу. */
        .lp-plan-item:first-child .lp-plan-rail::before { top: 10px; }
        .lp-plan-item:last-child .lp-plan-rail::before { bottom: calc(100% - 10px); }
        .lp-plan-item:only-child .lp-plan-rail::before { display: none; }
        .lp-plan-dot {
          position: relative; z-index: 1; display: block; margin: 6px auto 0;
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--accent); box-shadow: 0 0 0 3px var(--bg);
        }
        .lp-plan-text {
          padding-bottom: 12px; font-size: 14.5px; line-height: 1.5;
          color: var(--text-secondary);
        }
        .lp-plan-item:last-child .lp-plan-text { padding-bottom: 0; }
      `}</style>

      {/* ===== Sticky bar ===== */}
      {stickyBar && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            background: 'rgba(255,255,255,.72)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              maxWidth: 880,
              margin: '0 auto',
              padding: '14px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-.02em' }}>
              {c.brand}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Вход в приложение: SPA живёт под /app (см. backend serve_spa). */}
              <a href="/app" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{c.nav.login}</a>
              <a href="#lead" className="btn btn-primary btn-sm">{c.nav.cta}</a>
            </div>
          </div>
        </div>
      )}

      {/* ===== Hero ===== */}
      <section style={{ padding: '120px 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <span className="eyebrow">{c.hero.eyebrow}</span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(38px, 5.4vw, 60px)',
              lineHeight: 0.98,
              letterSpacing: '-.045em',
              margin: 0,
            }}
          >
            {c.hero.title}
          </h1>
          <p style={{ fontSize: 20, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0, maxWidth: 640, textWrap: 'pretty' } as CSSProperties}>
            {c.hero.subtitle1}
          </p>
          <p style={{ fontSize: 20, lineHeight: 1.6, margin: 0, maxWidth: 640, textWrap: 'pretty' } as CSSProperties}>
            {c.hero.subtitle2}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start', marginTop: 8 }}>
            <a
              href="#lead"
              className="btn btn-primary"
              style={{ padding: '16px 28px', fontSize: 17, borderRadius: 14, boxShadow: '0 8px 24px -8px rgba(37,99,235,.45)' }}
            >
              {c.hero.ctaButton}
            </a>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              {c.hero.ctaNote}
            </span>
          </div>
        </div>
      </section>

      {/* ===== Pain ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span className="eyebrow">{c.pain.eyebrow}</span>
          <h2 style={h2Style}>{c.pain.title}</h2>
          <p style={{ margin: 0, fontSize: 17, color: 'var(--text-secondary)' }}>
            {c.pain.intro}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {c.pain.points.map((text, i) => (
              <p key={i} className="lp-row" style={{ margin: 0, padding: '16px 0', fontSize: 17, lineHeight: 1.55 }}>
                {text}
              </p>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 700, letterSpacing: '-.01em' }}>
              {c.pain.outroBold}
            </p>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {c.pain.outroText}
            </p>
          </div>
        </div>
      </section>

      {/* ===== Week scenes ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.week.eyebrow}</span>
            <h2 style={h2Style}>{c.week.title}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {c.week.scenes.map((scene, i) => (
              <div key={i} className="lp-row" style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 24, padding: '20px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-ink)', letterSpacing: '-.01em' }}>{scene.day}</span>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>{scene.text}</p>
              </div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 19, lineHeight: 1.5, fontWeight: 700, letterSpacing: '-.01em' }}>
            {c.week.outro}
          </p>
        </div>
      </section>

      {/* ===== Solution ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 56, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <span className="eyebrow">{c.solution.eyebrow}</span>
            <h2 style={h2Style}>{c.solution.title}</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              {c.solution.text1}
            </p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65 }}>
              {c.solution.text2}
            </p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65 }}>{c.solution.text3}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {c.solution.resultIntro}
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
              {c.solution.resultItems.map((item, i, arr) => (
                <li key={i} className={i < arr.length - 1 ? 'lp-row' : undefined} style={{ padding: '14px 0', fontSize: 17, lineHeight: 1.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.how.eyebrow}</span>
            <h2 style={h2Style}>{c.how.title}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '40px 32px' }}>
            {c.how.steps.map((step, i) => {
              // Пункты этапа. Fallback на легаси-абзац text (старые сохранения из
              // БД могут не иметь points), чтобы рендер не падал.
              const points =
                step.points && step.points.length > 0
                  ? step.points
                  : step.text
                  ? [step.text]
                  : [];
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--accent-ink)', letterSpacing: '-.01em' }}>
                    {step.week}
                  </span>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-.03em', lineHeight: 1.15 }}>
                    {step.title}
                  </h3>
                  <ul className="lp-plan">
                    {points.map((point, j) => (
                      <li key={j} className="lp-plan-item">
                        <span className="lp-plan-rail">
                          <span className="lp-plan-dot" />
                        </span>
                        <span className="lp-plan-text">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Product ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>
            <span className="eyebrow">{c.product.eyebrow}</span>
            <h2 style={h2Style}>{c.product.title}</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)', textWrap: 'pretty' } as CSSProperties}>
              {c.product.intro}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--border-2)' }}>
              <span style={factLabelStyle}>{c.product.formatLabel}</span>
              <span style={factValueStyle}>{c.product.formatValue}</span>
            </div>
            {showPrice && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--border-2)' }}>
                <span style={factLabelStyle}>{c.product.priceLabel}</span>
                <span style={factValueStyle}>{c.product.priceValue}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--border-2)' }}>
              <span style={factLabelStyle}>{c.product.audienceLabel}</span>
              <span style={factValueStyle}>{c.product.audienceValue}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--accent)' }}>
              <span style={{ ...factLabelStyle, color: 'var(--accent-ink)' }}>{c.product.resultLabel}</span>
              <span style={{ ...factValueStyle, color: 'var(--accent-ink)' }}>
                {c.product.resultValue}
              </span>
            </div>
          </div>
          <div style={{ maxWidth: 780 }}>
            <h3 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-.03em' }}>{c.product.includedTitle}</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
              {c.product.included.map((item, i, arr) => (
                <li key={i} className={i < arr.length - 1 ? 'lp-row' : undefined} style={{ padding: '14px 0', fontSize: 17, lineHeight: 1.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== Blocks to implement ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.blocks.eyebrow}</span>
            <h2 style={h2Style}>{c.blocks.title}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px 40px' }}>
            {c.blocks.items.map((block, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={cardTitleStyle}>{block.title}</h3>
                <p style={cardTextStyle}>{block.text}</p>
              </div>
            ))}
          </div>
          <div style={{ maxWidth: 780, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-.02em', paddingTop: 32 }}>
              {c.blocks.toolsTitle}
            </h3>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {c.blocks.toolsText}
            </p>
          </div>
        </div>
      </section>

      {/* ===== Why it works ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.why.eyebrow}</span>
            <h2 style={h2Style}>{c.why.title}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32 }}>
            {c.why.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--accent)', letterSpacing: '-.03em', lineHeight: 1 }}>
                  {item.num}
                </span>
                <h3 style={cardTitleStyle}>{item.title}</h3>
                <p style={cardTextStyle}>{item.text}</p>
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 56,
              alignItems: 'start',
              marginTop: 8,
              paddingTop: 40,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-.03em', lineHeight: 1.1 }}>
                {c.why.afterTitle}
              </h3>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {c.why.afterText1}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.6 }}>
                {c.why.afterText2}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 2 }}>
                {c.why.afterLines.map((line, i) => (
                  <span key={i}>
                    {line}
                    <br />
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Proof ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>
            <span className="eyebrow">{c.proof.eyebrow}</span>
            <h2 style={h2Style}>{c.proof.title}</h2>
            <p style={{ margin: 0, fontSize: 17, color: 'var(--text-secondary)' }}>
              {c.proof.intro}
            </p>
          </div>
          <div className="clients-table">
            <div className="ct-row head" style={{ gridTemplateColumns: '2.3fr .8fr .8fr .8fr .8fr' }}>
              {c.proof.metricsHead.map((h, i) => (
                <span key={i}>{h}</span>
              ))}
            </div>
            {c.proof.metricsRows.map((row, ri) => (
              <div key={ri} className="ct-row" style={{ gridTemplateColumns: '2.3fr .8fr .8fr .8fr .8fr', cursor: 'default' }}>
                <span>{row.label}</span>
                {row.values.map((v, i) =>
                  i === row.values.length - 1 ? (
                    <span key={i} style={{ fontWeight: 700, color: 'var(--success)' }}>{v}</span>
                  ) : (
                    <span key={i}>{v}</span>
                  )
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{c.proof.groupsIntro}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 28 }}>
              {c.proof.groups.map((g, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>
                    {g.title}
                  </span>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{g.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Situations ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.situations.eyebrow}</span>
            <h2 style={h2Style}>{c.situations.title}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px 40px' }}>
            {c.situations.items.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-3)' }}>{s.num}</span>
                <h3 style={cardTitleStyle}>{s.title}</h3>
                <p style={cardTextStyle}>{s.text}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'start', paddingTop: 32, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-.03em' }}>{c.situations.casesTitle}</h3>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {c.situations.casesText1}
              </p>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, fontWeight: 600 }}>
                {c.situations.casesText2}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                {c.situations.casesRight}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Objections ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.objections.eyebrow}</span>
            <h2 style={h2Style}>{c.objections.title}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {c.objections.items.map((o, i) => (
              <div key={i} className="lp-row" style={{ padding: '24px 0' }}>
                <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, letterSpacing: '-.01em' }}>{o.q}</p>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{o.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">{c.faq.eyebrow}</span>
            <h2 style={h2Style}>{c.faq.title}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {c.faq.items.map((item, i) => (
              <details key={i} className="lp-row lp-details" style={{ padding: '18px 0' }}>
                <summary
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 16.5,
                    letterSpacing: '-.02em',
                  }}
                >
                  {item.q}
                  <span className="lp-chev" style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 400, transition: 'transform .2s', lineHeight: 1 }}>+</span>
                </summary>
                <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section id="lead" style={{ padding: '110px 24px 130px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 56, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <span className="eyebrow">{c.cta.eyebrow}</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(30px, 4vw, 44px)', letterSpacing: '-.04em', lineHeight: 1.02, margin: 0 }}>
              {c.cta.title}
            </h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)', textWrap: 'pretty' } as CSSProperties}>
              {c.cta.text}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>{c.cta.note}</p>
          </div>
          <div style={{ border: '1px solid var(--border-2)', borderRadius: 22, padding: 28, background: 'var(--card-bg)', boxShadow: 'var(--shadow-md)' }}>
            {!sent ? (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" htmlFor="lead-name" style={{ margin: 0 }}>{c.cta.nameLabel}</label>
                  <input className="form-input" id="lead-name" type="text" placeholder={c.cta.namePlaceholder} required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" htmlFor="lead-phone" style={{ margin: 0 }}>{c.cta.phoneLabel}</label>
                  <input className="form-input" id="lead-phone" type="text" placeholder={c.cta.phonePlaceholder} required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" htmlFor="lead-note" style={{ margin: 0 }}>{c.cta.noteLabel}</label>
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
                  style={{ padding: '14px 24px', fontSize: 16, borderRadius: 14, opacity: agreed && !sending ? 1 : 0.5, cursor: agreed && !sending ? 'pointer' : 'not-allowed' }}
                >
                  {sending ? c.cta.submitSending : c.cta.submit}
                </button>
                {error && (
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--danger, #e23d32)' }}>{error}</p>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
                <span className="pill pill-green"><span className="led" />{c.cta.successTitle}</span>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {c.cta.successText}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '28px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, letterSpacing: '-.01em' }}>{c.footer.brand}</span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{c.footer.tagline}</span>
        </div>
      </footer>
    </div>
  );
}
