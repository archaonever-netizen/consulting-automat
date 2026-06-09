import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

interface FocusItem {
  id: number;
  name: string;
  initials: string;
  color: string;
  done: number;
  total: number;
  health: number;
  health_label: string;
  health_cls: string;
}

interface HomeData {
  client_count: number;
  avg_health: number;
  total_briefs: number;
  total_briefs_done: number;
  focus_items: FocusItem[];
}

function greetByHour(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [userName, setUserName] = useState('');
  const [askInput, setAskInput] = useState('');
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  useEffect(() => {
    api.get('/api/auth/me').then(r => setUserName(r.data.full_name?.split(' ')[0] || '')).catch(() => {});
    api.get('/api/clients/home').then(r => setData(r.data)).catch(() => {});
  }, []);

  function handleAsk(text?: string) {
    const val = text || askInput.trim();
    if (!val) return;
    navigate('/chat');
  }

  const greet = greetByHour();
  const avgLabel =
    !data ? '' :
    data.avg_health === 100 ? 'Все брифы закрыты' :
    data.avg_health >= 66 ? 'Хороший прогресс' :
    data.avg_health >= 33 ? 'В работе' : 'Нужно заполнить';

  return (
    <div className="home-wrap">
      <div className="home">

        <div className="home-top">
          <span className="home-date">{today}</span>
        </div>

        <div className="hero">
          <span className="hero-ambient"></span>

          <svg className="hero-svg" viewBox="0 0 340 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="hgFade" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#2563EB" stopOpacity="0.5"/>
                <stop offset="1" stopColor="#2563EB" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <g stroke="url(#hgFade)" strokeWidth="1.2">
              <line x1="120" y1="0" x2="340" y2="220"/>
              <line x1="150" y1="0" x2="340" y2="190"/>
              <line x1="180" y1="0" x2="340" y2="160"/>
              <line x1="210" y1="0" x2="340" y2="130"/>
              <line x1="240" y1="0" x2="340" y2="100"/>
            </g>
          </svg>

          <div className="hero-eyebrow rise">Сводка от ШЕФ</div>
          <h1 className="hero-greet rise d1">
            {greet}{userName ? `, ${userName}` : ''}.&nbsp;
            <span className="soft">Вот что важно сегодня.</span>
          </h1>

          <div className="hero-brief rise d2">
            <div className="shef-mono lg">
              <svg viewBox="-20 -18 268 236" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <g fill="#fff">
                  <path d="M0 0H46V200H0Z"/>
                  <path d="M91 0H137V200H91Z"/>
                  <path d="M182 0H228V200H182Z"/>
                  <path d="M0 156H228V200H0Z"/>
                </g>
                <path d="M188 156H228L184 200H144Z" fill="#2563EB"/>
              </svg>
            </div>
            <p>
              {!data ? 'Загрузка...' :
               data.client_count === 0 ? 'Картотека пуста. Добавьте первого клиента, чтобы ШЕФ начал работу.' :
               data.focus_items.length > 0
                 ? <>Просмотрел <b>{data.client_count} {data.client_count === 1 ? 'клиента' : data.client_count < 5 ? 'клиента' : 'клиентов'}</b>. {data.focus_items.length} {data.focus_items.length === 1 ? 'клиент' : 'клиента'} с незаполненными брифами.</>
                 : <>Все <b>{data.client_count} {data.client_count === 1 ? 'клиент' : 'клиентов'}</b> в порядке — брифы заполнены.</>
              }
            </p>
          </div>

          <div className="ask rise d3">
            <div className="ask-box">
              <div className="shef-mono">
                <svg viewBox="-20 -18 268 236" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <g fill="#fff">
                    <path d="M0 0H46V200H0Z"/>
                    <path d="M91 0H137V200H91Z"/>
                    <path d="M182 0H228V200H182Z"/>
                    <path d="M0 156H228V200H0Z"/>
                  </g>
                  <path d="M188 156H228L184 200H144Z" fill="#2563EB"/>
                </svg>
              </div>
              <input
                type="text"
                value={askInput}
                onChange={e => setAskInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                placeholder="Спросите ШЕФ или поставьте задачу…"
              />
              <span className="ask-kbd">⌘K</span>
              <button className="ask-send" type="button" onClick={() => handleAsk()} title="Отправить">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>
                </svg>
              </button>
            </div>
            <div className="ask-chips">
              <button className="ask-chip" type="button" onClick={() => handleAsk('Что важно сделать сегодня?')}>Что важно сегодня?</button>
              <button className="ask-chip" type="button" onClick={() => handleAsk('Покажи клиентов в зоне риска')}>Клиенты в зоне риска</button>
              <button className="ask-chip" type="button" onClick={() => handleAsk('Подведи итоги недели')}>Итоги недели</button>
            </div>
          </div>
        </div>

        {data && data.focus_items.length > 0 && (
          <>
            <div className="home-label rise d4">
              <span className="l">Сегодня в фокусе <span className="cnt">· {data.focus_items.length}</span></span>
              <Link to="/clients">
                Все клиенты
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
                </svg>
              </Link>
            </div>
            <div className="focus rise d4">
              {data.focus_items.map(item => (
                <Link key={item.id} to={`/clients/${item.id}`} className="focus-row">
                  <span className="focus-av" style={{ background: item.color }}>{item.initials}</span>
                  <div className="focus-main">
                    <div className="focus-cl">{item.name}</div>
                    <div className="focus-ins">
                      Заполнено <b>{item.done} из {item.total}</b> брифов.{' '}
                      {item.done === 0 ? 'Нужно начать заполнение.' :
                       item.done === 1 ? 'Осталось два брифа.' : 'Остался один бриф.'}
                    </div>
                  </div>
                  <span className="focus-act">
                    Открыть
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="home-label rise d6"><span className="l">Портфель</span></div>
        <div className="pulse rise d6">
          <div className="pulse-stat">
            <div className="pv">{data?.client_count ?? '—'}</div>
            <div className="pk">клиентов</div>
          </div>
          <span className="pulse-div"></span>
          <div className="pulse-stat">
            <div className="pv">{data?.avg_health ?? '—'}<span className="sub">%</span></div>
            <div className="pk">прогресс брифов</div>
          </div>
          <span className="pulse-div"></span>
          <div className="pulse-stat">
            <div className="pv">{data?.total_briefs_done ?? '—'}<span className="sub"> / {data?.total_briefs ?? '—'}</span></div>
            <div className="pk">брифов заполнено</div>
          </div>
          {data && data.client_count > 0 && (
            <div className="pulse-tail">
              <span className="pg">{avgLabel}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
