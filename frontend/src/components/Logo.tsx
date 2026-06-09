// ШЕФ вордмарк + монограмма — точный вектор (design_handoff redesign/logo.js).
// Группа .body перекрашивается контекстом через CSS (тёмная на светлом сайдбаре,
// белая на тёмном сплэше); .accent всегда синий #2563EB.

export function ShefWordmark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -18 720 236" xmlns="http://www.w3.org/2000/svg" aria-label="ШЕФ" role="img">
      <g className="body" fill="#1D1D1F">
        {/* Ш */}
        <path d="M0 0H48V200H0Z" />
        <path d="M0 155H160L120 200H0Z" />
        <path d="M82 155V96L128 58V155Z" />
        <path d="M186 0H230V200H148L186 155Z" />
        {/* Е */}
        <path d="M268 0H318V200H268Z" />
        <path d="M268 0H478L438 50H268Z" />
        <path d="M268 78H352L312 128H268Z" />
        <path d="M268 150H438L478 200H268Z" />
        {/* Ф */}
        <path d="M585 -12H627V212H585Z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M508 100A98 82 0 1 0 704 100A98 82 0 1 0 508 100ZM554 100A52 42 0 1 0 658 100A52 42 0 1 0 554 100Z" />
      </g>
      {/* синий наконечник, завершающий среднюю перекладину «Е» */}
      <path className="accent" d="M352 78H404L364 128H312Z" fill="#2563EB" />
    </svg>
  );
}

// Монограмма-глиф (без тёмной плашки) — для вставки внутрь .shef-mono span,
// который сам даёт тёмный фон. Используется в ШЕФ-байлайнах.
export function ShefMonoGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="-20 -18 268 236" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#fff">
        <path d="M0 0H46V200H0Z" /><path d="M91 0H137V200H91Z" />
        <path d="M182 0H228V200H182Z" /><path d="M0 156H228V200H0Z" />
      </g>
      <path d="M188 156H228L184 200H144Z" fill="#2563EB" />
    </svg>
  );
}

export function ShefMono({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="-20 -18 268 236" xmlns="http://www.w3.org/2000/svg" aria-label="ШЕФ" role="img">
      <rect x="-20" y="-18" width="268" height="236" rx="40" fill="#1C1C1E" />
      <g fill="#fff">
        <path d="M0 0H46V200H0Z" /><path d="M91 0H137V200H91Z" />
        <path d="M182 0H228V200H182Z" /><path d="M0 156H228V200H0Z" />
      </g>
      <path d="M188 156H228L184 200H144Z" fill="#2563EB" />
    </svg>
  );
}
