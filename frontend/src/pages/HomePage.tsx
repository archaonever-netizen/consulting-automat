import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';
import { ShefMonoGlyph } from '../components/Logo';

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
  // Ключ ['me'] общий с Layout: профиль грузится один раз и кэшируется 5 минут
  const { data: me } = useQuery<{ full_name?: string }>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/api/auth/me')).data,
    staleTime: 5 * 60_000,
  });
  const userName = me?.full_name?.split(' ')[0] || '';
  const { data } = useQuery<HomeData>({
    queryKey: ['home'],
    queryFn: async () => (await api.get('/api/clients/home')).data,
  });
  const [askInput, setAskInput] = useState('');
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

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

          <div className="hero-eyebrow rise">Сводка от ШЕФ</div>
          <h1 className="hero-greet rise d1">
            {greet}{userName ? `, ${userName}` : ''}.&nbsp;
            <span className="soft">Вот что важно сегодня.</span>
          </h1>

          <div className="hero-brief rise d2">
            <span className="shef-mono lg"><ShefMonoGlyph /></span>
            <p>
              {!data ? 'Загрузка…' :
               data.client_count === 0 ? 'Картотека пуста. Добавьте первого клиента, чтобы ШЕФ начал работу.' :
               data.focus_items.length > 0
                 ? <>Просмотрел <b>{data.client_count} {data.client_count === 1 ? 'клиента' : data.client_count < 5 ? 'клиента' : 'клиентов'}</b>. {data.focus_items.length} {data.focus_items.length === 1 ? 'клиент' : 'клиента'} с незаполненными брифами.</>
                 : <>Все <b>{data.client_count} {data.client_count === 1 ? 'клиент' : 'клиентов'}</b> в порядке — брифы заполнены.</>
              }
            </p>
          </div>

          <div className="ask rise d3">
            <div className="ask-box">
              <span className="shef-mono"><ShefMonoGlyph /></span>
              <input
                type="text"
                value={askInput}
                onChange={e => setAskInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                placeholder="Спросите ШЕФ или поставьте задачу…"
              />
              <span className="ask-kbd">⌘K</span>
              <button className="ask-send" type="button" onClick={() => handleAsk()} title="Отправить">
                <Icon name="send" size={18} />
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
              <Link to="/clients">Все клиенты <Icon name="arrowRight" size={14} /></Link>
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
                  <span className="focus-act">Открыть <Icon name="arrowRight" size={15} /></span>
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
            <div className="pulse-tail"><span className="pg">{avgLabel}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
