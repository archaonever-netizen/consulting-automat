import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import LandingPage from './LandingPage';
import { defaultLandingContent as d } from './content';

// Реально исполняем рендер лендинга на дефолтном контенте (useEffect/фетч в
// renderToString не выполняется — значит проверяем именно ветку дефолтов).
// Если какое-то поле контента отсутствует/переименовано — рендер упадёт здесь.
describe('LandingPage', () => {
  it('рендерит дефолтный контент без ошибок и содержит ключевые тексты', () => {
    const html = renderToString(<LandingPage />);
    expect(html).toContain(d.hero.title);
    expect(html).toContain(d.hero.subtitle1);
    expect(html).toContain(d.pain.points[0]);
    expect(html).toContain(d.how.steps[0].title);
    expect(html).toContain(d.product.priceValue);
    // Раздел «Диагностика»: заголовок, стоимость и первый выпадающий блок с пунктом.
    expect(html).toContain(d.diagnostics.title);
    expect(html).toContain(d.diagnostics.priceValue);
    expect(html).toContain(d.diagnostics.items[0].title);
    expect(html).toContain(d.diagnostics.items[0].points[0]);
    expect(html).toContain(d.proof.metricsRows[0].label);
    expect(html).toContain(d.objections.items[0].q);
    // Блок «Кейсы клиентов» (заголовок + название кейса + пункты + заголовок результата).
    expect(html).toContain(d.cases.title);
    expect(html).toContain(d.cases.items[0].title);
    expect(html).toContain(d.cases.items[0].beforePoints[0]);
    expect(html).toContain(d.cases.items[0].changedPoints[0]);
    expect(html).toContain(d.cases.items[0].resultTitle);
    expect(html).toContain(d.cases.items[0].resultPoints[0]);
    // Легаси-блок «было/стало» по умолчанию скрыт с сайта (legacyCases=true).
    expect(html).not.toContain(d.situations.casesRowTitle);
    expect(html).not.toContain(d.situations.casesItems[0].industry);
    expect(html).toContain(d.faq.items[0].q);
    expect(html).toContain(d.cta.submit);
    expect(html).toContain(d.footer.tagline);
  });

  it('прячет цену при showPrice=false', () => {
    const html = renderToString(<LandingPage showPrice={false} />);
    expect(html).not.toContain(d.product.priceValue);
    // Остальной контент на месте.
    expect(html).toContain(d.hero.title);
  });
});
