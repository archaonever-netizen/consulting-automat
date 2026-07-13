/**
 * Scroll-reveal: плавно проявляет элементы при первом попадании во вьюпорт.
 *
 * Порт standalone-логики из дизайн-хендоффа (design_handoff_landing_page/
 * scroll-reveal.js). Работает в паре с CSS в LandingPage.tsx (`[data-reveal]` →
 * `.is-visible` через keyframe `fadeInUp`, с уважением к prefers-reduced-motion).
 *
 * Помечаем анимируемый элемент атрибутом `data-reveal`, опционально с инлайн
 * `style="--d: 0.08s"` для сдвига (stagger) соседей внутри группы.
 *
 * Возвращает функцию-очистку, отключающую observer.
 */
export function mountScrollReveal(
  selector = '[data-reveal]',
  options: IntersectionObserverInit = {},
): () => void {
  const els = document.querySelectorAll(selector);
  if (!els.length) return () => {};

  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px', ...options },
  );

  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
