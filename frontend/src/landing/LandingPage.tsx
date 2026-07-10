import { useState, type CSSProperties, type FormEvent } from 'react';

/**
 * Публичный лендинг «Модуль устранения потерь».
 * Смонтирован как отдельный Vite-вход (frontend/landing.html →
 * src/landing/main.tsx), по аналогии с клиентским порталом. Бэкенд отдаёт
 * собранный dist/landing.html на корне домена, а SPA живёт под /app
 * (BrowserRouter basename="/app"). Поэтому App.tsx этот компонент не роутит.
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

const painPoints: string[] = [
  'Менеджер согласовывает все предложения, пока клиент остывает.',
  'Руководитель приходит не с решением, а с задачей.',
  'В CRM одна цифра, у руководителя в голове другая, фактически третья.',
  'Задача не выполнена, но при разборе начинается поиск виноватых, и чаще всего это соседний отдел.',
  'CRM куплена, интегратор отработал, но фактически все данные всё равно по блокнотам, таблицам и мессенджерам.',
  'Планёрки проходят регулярно, но решения с прошлой недели не выполняются, а инициативы не имеют смысла.',
];

const weekScenes: { day: string; text: string }[] = [
  {
    day: 'Понедельник, 10:15',
    text: 'У вас уже семь сообщений по текущим вопросам. Два вопроса по согласованию условий для клиента, один негативный клиент, который требует возврат денег. А продажи снова недовольны маркетингом. День только начался.',
  },
  {
    day: 'Вторник, встреча',
    text: 'Менеджер опять отпустил клиента подумать. Потому что клиент был «не такой»: разговаривал не так и купить точно не хотел, хотя был очень приятным собеседником. Завтра выяснится, что клиент купил у конкурента — это точно знаете вы, но почему-то не ваш менеджер.',
  },
  {
    day: 'Среда, планёрка',
    text: 'По спринту снова нет движения. Ответственный вроде был, но опять «работали, и времени на эту задачу не хватило». Все объясняют логично. Но результата нет.',
  },
  {
    day: 'Четверг, финансы',
    text: 'Вы спрашиваете, сколько заработали за прошлый месяц. Ответ зависит от того, кого спросить. В отчёте прибыль есть, на счёте денег мало.',
  },
  {
    day: 'Пятница, вечер',
    text: 'Вы понимаете, что неделя ушла на тушение вопросов, которые взрослая команда должна решать без владельца.',
  },
];

const howItWorks: { week: string; title: string; text: string }[] = [
  {
    week: 'Неделя 1',
    title: 'Диагностика и выбор управленческого блока',
    text: 'Разбираем продажи, маржу, сроки, ответственность, отчёты и текущий ритм управления. Находим 3–5 зон потерь и выбираем один узел с самым быстрым эффектом.',
  },
  {
    week: 'Неделя 2',
    title: 'Проектирование правил',
    text: 'Фиксируем, как должно работать: роли, лимиты, ответственность, метрики, точки контроля, формат эскалации. Убираем серые зоны, где раньше всё решалось «по ситуации».',
  },
  {
    week: 'Неделя 3',
    title: 'Внедрение в работу команды',
    text: 'Проводим рабочие сессии, настраиваем формат планёрки, вводим трекер решений, закрепляем ответственных. Команда работает по новым правилам, а не знакомится с документом.',
  },
  {
    week: 'Неделя 4',
    title: 'Контроль и фиксация результата',
    text: 'Смотрим, что прижилось, где команда сопротивляется, какие решения зависают. Дорабатываем блок и собираем план следующих внедрений.',
  },
];

const whatIncluded: string[] = [
  'Диагностика коммерческой системы',
  'Разбор продаж, маржи, сроков и ответственности',
  'Расчёт ключевых зон потерь',
  'Выбор одного блока для внедрения',
  'Проектирование правил, ролей, метрик и контрольных точек',
  'Еженедельные рабочие сессии',
  'Контроль выполнения решений',
  'Финальная сессия с фиксацией результата',
  'Мониторинг и изучение команды: кто союзник системы, а кто саботирует решения',
  'Подбор наиболее эффективных инструментов — от таблицы до ИИ-интеграции, в зависимости от зрелости управленческой системы',
];

const firstBlocks: { title: string; text: string }[] = [
  {
    title: 'Правила сделки',
    text: 'Чтобы менеджер знал, какими инструментами может пользоваться для достижения цели, и хотел её достичь.',
  },
  {
    title: 'Правила ведения клиента',
    text: 'Чтобы каждый сотрудник знал, в какой момент наступает его ответственность и что делать, когда клиент идёт по всему треку сделки.',
  },
  {
    title: 'Контроль маржи',
    text: 'Чтобы рост выручки перестал маскировать убыточные продукты, клиентов и скидки.',
  },
  {
    title: 'Передача клиента',
    text: 'Чтобы клиент не проваливался между отделами, а ответственность не растворялась после получения лида.',
  },
  {
    title: 'Еженедельные метрики',
    text: 'Не на словах, а в жизни компании — чтобы ясно понимать реальную картину в работе.',
  },
  {
    title: 'Результативные планёрки',
    text: 'Чтобы перестать тратить время на разговоры, а планировать, фиксировать решения, контролировать результат.',
  },
];

const whyItWorks: { num: string; title: string; text: string }[] = [
  {
    num: '01',
    title: 'Начинаем с денег и управляемости',
    text: 'Не описываем всё подряд. Сначала ищем, где бизнес теряет деньги, скорость или контроль.',
  },
  {
    num: '02',
    title: 'Берём один блок',
    text: 'У собственника и команды редко есть ресурс на тотальную перестройку. Один блок проще внедрить и закрепить.',
  },
  {
    num: '03',
    title: 'Встраиваем в неделю команды',
    text: 'Правила живут в планёрке, трекере решений и ответственности руководителей. Иначе они остаются файлом.',
  },
  {
    num: '04',
    title: 'Смотрим на выполнение',
    text: 'Сильная система отличается не красотой схемы, а тем, что решения выполняются без давления владельца.',
  },
];

const situations: { num: string; title: string; text: string }[] = [
  {
    num: '01',
    title: 'Собственник завален согласованиями',
    text: 'Каждый день десятки вопросов: скидки, уступки, сроки, исключения. В спринте можно внедрить правила полномочий, лимиты и эскалацию.',
  },
  {
    num: '02',
    title: 'Выручка растёт, прибыль не растёт',
    text: 'Команда продаёт, но никто точно не видит маржу по продуктам и клиентам. В спринте можно внедрить контроль маржи и правила скидок.',
  },
  {
    num: '03',
    title: 'Задачи зависают между отделами',
    text: 'Продажи кивают на производство, производство на снабжение. В спринте можно закрепить ответственность и правила передачи.',
  },
  {
    num: '04',
    title: 'Планёрки есть, управления нет',
    text: 'Все встречаются, обсуждают, расходятся. Через неделю те же вопросы. В спринте можно внедрить ритм, трекер решений и контроль исполнения.',
  },
];

const objections: { q: string; a: string }[] = [
  {
    q: '«Я уже и так подписан на *** и на ***, проходил Ре***. Всё заканчивается тем, что проблему находят, но проблемы так и не решены».',
    a: 'Основной продукт построен вокруг внедрения. Лучшее — враг хорошего. Поэтому необходимо точно определить, что реально нужно менять, а что работает и на данный момент не нуждается в срочных изменениях. Диагностика экономит ваши силы и ресурсы, но не является целью интеграции.',
  },
  {
    q: '«Каждый месяц пытаюсь что-то поменять. Команда просто не принимает изменений».',
    a: 'Работа с сопротивлением команды — один из самых сложных аспектов внедрения изменений. Его нельзя поручить ИИ, и в наше время нельзя просто заменить сотрудника: скорее всего, готовой замены сейчас просто нет. Именно тут раскрывается польза экспертов, которые умеют работать с сопротивлением и уравновешивать этот процесс.',
  },
  {
    q: '«У меня есть срочные задачи, и я не могу тратить время на интеграции сейчас».',
    a: 'Мы специально разбили архитектурные трансформации на модули и спринты. В наше время закладывать трансформационный процесс на год просто неэффективно — скорее всего, через 2 месяца уже сильно изменится окружение. Поэтому мы работаем небольшими и понятными итерациями в месяц-два, чтобы результат был понятен и осязаем, а вы почувствовали облегчение уже на следующий месяц.',
  },
  {
    q: '«Мы сами можем это сделать».',
    a: 'Можете, но чаще всего одних знаний недостаточно, иначе это было бы сделано уже давно. Проблема в том, что работа с изменениями — отдельный процесс, и обычно в компаниях просто нет выделенных и заложенных ресурсов на такие проекты. А те, кто пытается сделать это параллельно с основной ролью, не могут удержать результат на долгой дистанции.',
  },
  {
    q: '«Цена высокая».',
    a: 'В наше время любой продукт стоит оценивать по трём критериям: качество, скорость, цена. Вы избавляетесь от проблем, которые копятся годами, и запускаете процесс постоянных улучшений за месяц — благодаря тому, что работаете не с одним человеком, а с целой командой. Стоимость же эквивалентна оплате месяца работы одного профильного специалиста, который первый месяц будет только вникать в работу.',
  },
  {
    q: '«Вдруг вы не поймёте наш бизнес».',
    a: 'Мы работаем не с конкретным шаблоном по нише, а с системой управления. Поэтому на диагностике мы принимаем решение и со своей стороны: если вы работаете в специфической нише, где система управления и контроля в корне отличается от общепринятой, мы честно скажем об этом и не пойдём дальше.',
  },
];

const faqs: { q: string; a: string }[] = [
  {
    q: 'С чего начинается работа?',
    a: 'С квалификационного разбора на 45–60 минут. Вы описываете ситуацию, мы задаём вопросы по продажам, управлению, цифрам, ролям и текущим потерям. После этого понятно, есть ли смысл идти в коммерческий разбор или спринт.',
  },
  {
    q: 'Что нужно подготовить?',
    a: 'Минимально: описание команды, текущую структуру, примеры отчётов, данные по продажам, CRM или таблицы, несколько типовых ситуаций, где всё зависает.',
  },
  {
    q: 'Можно ли начать без CRM?',
    a: 'Можно, если есть хотя бы таблицы, сделки, отчёты или управленческие наблюдения. Но если данных совсем нет, первым узлом может стать базовый контур метрик.',
  },
  {
    q: 'Что будет после заявки?',
    a: 'Мы связываемся, уточняем контекст и проводим квалификационный разбор. Если видим, что задача подходит, предлагаем следующий шаг: коммерческий разбор или спринт.',
  },
  {
    q: 'Вы внедряете всё за 4 недели?',
    a: 'Нет. За 1 месяц внедряется один управленческий блок. Это честный объём. Полная система управления собирается поэтапно: сначала видимость и ответственность, затем процессы, данные, удержание, стратегия.',
  },
  {
    q: 'Кто должен участвовать?',
    a: 'Собственник и те руководители, которых касается выбранный блок. Если внедряем скидки и маржу, нужны продажи и финансы. Если ответственность на стыках, нужны руководители смежных функций.',
  },
  {
    q: 'Что мы получим на выходе?',
    a: 'Диагноз выбранного блока, регламент первого блока, матрицу ответственности, набор метрик, формат управленческой встречи, трекер решений и план следующих внедрений.',
  },
  {
    q: 'Можно ли ограничиться разбором?',
    a: 'Можно. Коммерческий разбор даёт управленческое заключение, зоны потерь, первичный расчёт и рекомендацию первого блока. Но если вам нужен результат в работе компании, нужен спринт внедрения.',
  },
  {
    q: 'Когда нужен формат сопровождения?',
    a: 'После первого спринта, если вы хотите последовательно внедрять следующие блоки: маржу, ответственность, отчётность, процессы, удержание, стратегические инициативы.',
  },
  {
    q: 'Как понять, что нам рано?',
    a: 'Если нет регулярных продаж, команды, управленческих решений и хотя бы минимальных данных, спринт может быть преждевременным. В таком случае лучше начать с простого разбора и определить следующий шаг.',
  },
];

const metricsHead = ['Метрика', 'Неделя 1', 'Неделя 2', 'Неделя 3', 'Неделя 4 · 1 месяц'];
const metricsRows: { label: string; values: string[] }[] = [
  { label: 'Эскалации к руководителю', values: ['14', '11', '8', '6'] },
  { label: 'Средний срок выполнения задачи (дней)', values: ['2.4', '1.8', '1.1', '0.6'] },
  { label: 'Сделок провалено', values: ['18%', '14%', '9%', '5%'] },
  { label: 'Маржинальность', values: ['22%', '25%', '29%', '34%'] },
  { label: 'Задач бездействует', values: ['9', '7', '4', '2'] },
  { label: 'Просроченные задачи', values: ['23%', '17%', '11%', '6%'] },
  { label: 'Ведение CRM', values: ['61%', '74%', '88%', '97%'] },
];

const metricGroups: { title: string; text: string }[] = [
  { title: 'Полномочия', text: 'Скорость решений и доля вопросов, ушедших с собственника.' },
  { title: 'Маржинальность', text: 'Продукты, клиенты и сделки, которые продаются ниже допустимого уровня.' },
  { title: 'Ответственность', text: 'Просрочки, зависшие задачи и конфликты на стыках.' },
  { title: 'Метрики', text: 'Скорость реакции на отклонения и качество отчётности.' },
];

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

// Версия (редакция) политики обработки ПДн, с которой соглашается пользователь.
// ВАЖНО: держать в синхроне с датой редакции в frontend/public/privacy.html.
// При каждом изменении текста политики — обновлять здесь и там.
const PRIVACY_POLICY_VERSION = '2026-07-07';

export default function LandingPage({ showPrice = true, stickyBar = true }: LandingPageProps) {
  const [sent, setSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError('Не удалось отправить заявку. Попробуйте ещё раз или напишите нам напрямую.');
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
              Модуль устранения потерь
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Вход в приложение: SPA живёт под /app (см. backend serve_spa). */}
              <a href="/app" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Войти</a>
              <a href="#lead" className="btn btn-primary btn-sm">Оставить заявку</a>
            </div>
          </div>
        </div>
      )}

      {/* ===== Hero ===== */}
      <section style={{ padding: '120px 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <span className="eyebrow">Модуль устранения потерь для собственника МСБ · с гарантией результата</span>
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
            За 1 месяц найдём, где компания теряет больше всего денег уже сейчас
          </h1>
          <p style={{ fontSize: 20, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0, maxWidth: 640, textWrap: 'pretty' } as CSSProperties}>
            Ваш бизнес может зарабатывать до 29 миллионов дополнительной прибыли в год. Без увеличения расходов.
          </p>
          <p style={{ fontSize: 20, lineHeight: 1.6, margin: 0, maxWidth: 640, textWrap: 'pretty' } as CSSProperties}>
            Интегрируем найденные улучшения в работу команды и сопроводим изменения — с гарантией результата.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start', marginTop: 8 }}>
            <a
              href="#lead"
              className="btn btn-primary"
              style={{ padding: '16px 28px', fontSize: 17, borderRadius: 14, boxShadow: '0 8px 24px -8px rgba(37,99,235,.45)' }}
            >
              Оставить заявку на разбор
            </a>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              За 60 минут разберём, есть ли у вас блок, который стоит разобрать глубже.
            </span>
          </div>
        </div>
      </section>

      {/* ===== Pain ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span className="eyebrow">Знакомая картина</span>
          <h2 style={h2Style}>Бизнес вроде работает. Но только когда работаете вы.</h2>
          <p style={{ margin: 0, fontSize: 17, color: 'var(--text-secondary)' }}>
            Вы можете не называть это проблемой архитектуры. Обычно это выглядит проще.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {painPoints.map((text) => (
              <p key={text} className="lp-row" style={{ margin: 0, padding: '16px 0', fontSize: 17, lineHeight: 1.55 }}>
                {text}
              </p>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 700, letterSpacing: '-.01em' }}>
              Постепенно собственник бизнеса становится рабом компании.
            </p>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Потому что компания работает только когда работает её собственник.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Week scenes ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">Одна рабочая неделя</span>
            <h2 style={h2Style}>Где это проявляется в реальной неделе</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {weekScenes.map((scene) => (
              <div key={scene.day} className="lp-row" style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 24, padding: '20px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-ink)', letterSpacing: '-.01em' }}>{scene.day}</span>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>{scene.text}</p>
              </div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 19, lineHeight: 1.5, fontWeight: 700, letterSpacing: '-.01em' }}>
            Это не усталость. Это сигнал, что компания переросла ручную модель управления.
          </p>
        </div>
      </section>

      {/* ===== Solution ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 56, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <span className="eyebrow">Подход</span>
            <h2 style={h2Style}>Сначала находим блок. Затем внедряем первый рабочий блок.</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              В «Модуле устранения потерь» мы не начинаем с большой перестройки компании.
            </p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65 }}>
              Сначала смотрим, где бизнес теряет больше всего: в скидках, марже, ответственности, сроках, передаче клиента, отчётности или ритме управления.
            </p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65 }}>Затем выбираем один управленческий блок и внедряем его за 1 месяц.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              На выходе у вас не презентация с рекомендациями. У вас появляется рабочий контур, который можно использовать сразу — понятно:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
              {[
                'Кто и какие решения принимает',
                'Кто отвечает за результат',
                'Какие метрики это описывают',
                'Где и как фиксируются решения',
                'Как контролируется выполнение',
                'Как превратить самостоятельные решения в систему',
              ].map((item, i, arr) => (
                <li key={item} className={i < arr.length - 1 ? 'lp-row' : undefined} style={{ padding: '14px 0', fontSize: 17, lineHeight: 1.5 }}>
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
            <span className="eyebrow">Как это работает</span>
            <h2 style={h2Style}>1 месяц, один управленческий блок, понятный результат</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '40px 32px' }}>
            {howItWorks.map((step) => (
              <div key={step.week} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--accent-ink)', letterSpacing: '-.01em' }}>
                  {step.week}
                </span>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-.03em', lineHeight: 1.15 }}>
                  {step.title}
                </h3>
                <p style={cardTextStyle}>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Product ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>
            <span className="eyebrow">Продукт</span>
            <h2 style={h2Style}>Что такое «Модуль устранения потерь»</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)', textWrap: 'pretty' } as CSSProperties}>
              4-недельный проект для собственника МСБ, который хочет перестать разбирать всё вручную и внедрить первый управленческий блок.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--border-2)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Формат</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-.02em' }}>1 месяц работы</span>
            </div>
            {showPrice && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--border-2)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Стоимость</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-.02em' }}>120–250 тыс. ₽</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--border-2)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Для кого</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-.02em' }}>Собственник компании</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20, borderLeft: '2px solid var(--accent)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>Результат</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-.02em', color: 'var(--accent-ink)' }}>
                Первый рабочий контур
              </span>
            </div>
          </div>
          <div style={{ maxWidth: 780 }}>
            <h3 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-.03em' }}>Что входит</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
              {whatIncluded.map((item, i, arr) => (
                <li key={item} className={i < arr.length - 1 ? 'lp-row' : undefined} style={{ padding: '14px 0', fontSize: 17, lineHeight: 1.5 }}>
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
            <span className="eyebrow">Первый блок</span>
            <h2 style={h2Style}>Какие блоки можно внедрить первыми</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px 40px' }}>
            {firstBlocks.map((block) => (
              <div key={block.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={cardTitleStyle}>{block.title}</h3>
                <p style={cardTextStyle}>{block.text}</p>
              </div>
            ))}
          </div>
          <div style={{ maxWidth: 780, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-.02em', paddingTop: 32 }}>
              Инструменты продукта
            </h3>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Матрица ответственности, правила полномочий и лимитов, регламент эскалаций, трекер управленческих решений, набор еженедельных метрик, формат управленческой планёрки, карта зон потерь, план следующих внедрений — под вашу реальность: роли, сделки, отчёты, команду, текущие ограничения.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Why it works ===== */}
      <section style={{ padding: '96px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">Принципы</span>
            <h2 style={h2Style}>Почему это работает</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32 }}>
            {whyItWorks.map((item) => (
              <div key={item.num} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                Что меняется после первого спринта
              </h3>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                У собственника появляется первый участок бизнеса, где стало понятно, кто принимает решение, кто отвечает за результат и какие цифры показывают отклонение.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.6 }}>
                Это ещё не вся система управления. Но это первый рабочий контур, на который можно опираться.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 2 }}>
                Кто принимает решение.<br />
                Кто отвечает за результат.<br />
                Какие цифры показывают норму и отклонение.<br />
                Где фиксируются договорённости.<br />
                Когда вопрос поднимается наверх.<br />
                Что команда делает без владельца.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Proof ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>
            <span className="eyebrow">Измеримость</span>
            <h2 style={h2Style}>Проверяемые и измеримые критерии</h2>
            <p style={{ margin: 0, fontSize: 17, color: 'var(--text-secondary)' }}>
              В работе мы смотрим на показатели, которые можно проверить.
            </p>
          </div>
          <div className="clients-table">
            <div className="ct-row head" style={{ gridTemplateColumns: '2.3fr .8fr .8fr .8fr .8fr' }}>
              {metricsHead.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {metricsRows.map((row) => (
              <div key={row.label} className="ct-row" style={{ gridTemplateColumns: '2.3fr .8fr .8fr .8fr .8fr', cursor: 'default' }}>
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
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Для разных блоков эффект считается по-разному.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 28 }}>
              {metricGroups.map((g) => (
                <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            <span className="eyebrow">С чем приходят</span>
            <h2 style={h2Style}>Примеры ситуаций, с которыми приходят</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px 40px' }}>
            {situations.slice(0, 3).map((s) => (
              <div key={s.num} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-3)' }}>{s.num}</span>
                <h3 style={cardTitleStyle}>{s.title}</h3>
                <p style={cardTextStyle}>{s.text}</p>
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-3)' }}>{situations[3].num}</span>
                <h3 style={cardTitleStyle}>{situations[3].title}</h3>
                <p style={cardTextStyle}>{situations[3].text}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'start', paddingTop: 32, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-.03em' }}>Если нужны кейсы</h3>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                Часть управленческих проектов нельзя показывать публично: внутри бывают данные по марже, зарплатам, клиентам, долгам и конфликтам между руководителями.
              </p>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, fontWeight: 600 }}>
                Если у вас уже есть конкретная боль, мы разберём похожую механику на вашем примере.
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                На разборе показываем: как выглядит управленческое заключение; как считается зона потерь; как выглядит матрица ответственности; как фиксируется решение; как строится первый набор метрик; как выглядит план следующих внедрений.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Objections ===== */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow">Честный разговор</span>
            <h2 style={h2Style}>С какими сомнениями обычно приходят</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {objections.map((o) => (
              <div key={o.q} className="lp-row" style={{ padding: '24px 0' }}>
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
            <span className="eyebrow">Вопросы</span>
            <h2 style={h2Style}>FAQ</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {faqs.map((item) => (
              <details key={item.q} className="lp-row lp-details" style={{ padding: '18px 0' }}>
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
            <span className="eyebrow">Следующий шаг</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(30px, 4vw, 44px)', letterSpacing: '-.04em', lineHeight: 1.02, margin: 0 }}>
              Начните с разбора управляемости
            </h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-secondary)', textWrap: 'pretty' } as CSSProperties}>
              За 45–60 минут посмотрим, где у вас теряются деньги, скорость или контроль, и поймём, есть ли смысл идти в спринт.
            </p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>Без обязательства покупать проект. Если спринт не нужен, скажем прямо.</p>
          </div>
          <div style={{ border: '1px solid var(--border-2)', borderRadius: 22, padding: 28, background: 'var(--card-bg)', boxShadow: 'var(--shadow-md)' }}>
            {!sent ? (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" htmlFor="lead-name" style={{ margin: 0 }}>Имя</label>
                  <input className="form-input" id="lead-name" type="text" placeholder="Как к вам обращаться" required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" htmlFor="lead-phone" style={{ margin: 0 }}>Телефон или Telegram</label>
                  <input className="form-input" id="lead-phone" type="text" placeholder="+7 900 000-00-00 или @username" required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" htmlFor="lead-note" style={{ margin: 0 }}>Коротко о ситуации (необязательно)</label>
                  <textarea className="form-textarea" id="lead-note" placeholder="Что чаще всего зависает на вас?" style={{ minHeight: 88 }} />
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
                    Нажимая кнопку, я соглашаюсь с{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-ink)', textDecoration: 'underline' }}>
                      политикой обработки персональных данных
                    </a>{' '}
                    и даю согласие на обработку моих данных.
                  </span>
                </label>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={!agreed || sending}
                  style={{ padding: '14px 24px', fontSize: 16, borderRadius: 14, opacity: agreed && !sending ? 1 : 0.5, cursor: agreed && !sending ? 'pointer' : 'not-allowed' }}
                >
                  {sending ? 'Отправляем…' : 'Оставить заявку на разбор'}
                </button>
                {error && (
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--danger, #e23d32)' }}>{error}</p>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
                <span className="pill pill-green"><span className="led" />Заявка отправлена</span>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  Мы свяжемся с вами, уточним контекст и договоримся о времени квалификационного разбора.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '28px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, letterSpacing: '-.01em' }}>Модуль устранения потерь</span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Проект для собственников МСБ · 1 месяц · один управленческий блок</span>
        </div>
      </footer>
    </div>
  );
}
