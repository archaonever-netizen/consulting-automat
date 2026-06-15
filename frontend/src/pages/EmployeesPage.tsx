import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

interface BotListItem {
  id: number;
  key: string;
  name: string;
  description: string | null;
  model: string | null;
  is_active: boolean;
}

export default function EmployeesPage() {
  const { data, isLoading, isError } = useQuery<BotListItem[]>({
    queryKey: ['bots'],
    queryFn: async () => (await api.get('/api/bots')).data,
  });

  if (isLoading) return <div className="page"><div className="loading-bar" /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">ИИ-Сотрудники</h1>
        <p className="page-subtitle">
          Боты компании. Клик по карточке — настройки, промпты, фреймворки и проверочный чат.
        </p>
      </div>

      {isError && (
        <div className="kb-empty">Раздел доступен только основателю.</div>
      )}

      {data && data.length > 0 ? (
        <div className="kb-cards">
          {data.map(bot => (
            <Link
              key={bot.id}
              to={`/employees/${bot.id}`}
              className="kb-card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div className="kb-card-head">
                <span className="kb-card-icon"><Icon name="sparkle" size={20} /></span>
                <div className="kb-card-title"><b>{bot.name}</b></div>
                <span className="kb-card-open"><Icon name="arrowRight" size={18} /></span>
              </div>
              <div className="kb-card-sum">{bot.description || 'Без описания'}</div>
              {bot.model && (
                <span className="badge" style={{ fontSize: 11 }}>{bot.model}</span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        !isError && <div className="kb-empty">Ботов пока нет.</div>
      )}
    </div>
  );
}
