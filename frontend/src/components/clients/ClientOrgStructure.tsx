import { useState } from 'react';
import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import Icon from '../Icon';

// Разделы клиентского портала (скелет — синхронизирован с backend PORTAL_SECTIONS).
const SECTIONS: { key: string; label: string }[] = [
  { key: 'project', label: 'Проект' },
  { key: 'stages', label: 'Этапы проекта' },
  { key: 'status', label: 'Статус проекта' },
  { key: 'documents', label: 'Документы и файлы' },
  { key: 'events', label: 'События' },
  { key: 'info', label: 'Информация' },
];
const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  SECTIONS.map(s => [s.key, s.label]),
);

interface PortalUser {
  id: number;
  client_id: number;
  full_name: string;
  email: string;
  role: string;
  sections: string[];
  is_active: boolean;
  created_at: string | null;
}

interface FormState {
  full_name: string;
  email: string;
  password: string;
  role: string;
  sections: string[];
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  full_name: '', email: '', password: '', role: '', sections: [], is_active: true,
};

function apiError(e: unknown, fallback: string): string {
  if (e instanceof AxiosError) {
    const detail = (e.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
    // FastAPI 422: detail — массив объектов с msg
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  }
  return fallback;
}

export default function ClientOrgStructure({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery<PortalUser[]>({
    queryKey: ['portal-users', clientId],
    queryFn: async () => (await api.get(`/api/clients/${clientId}/portal-users`)).data,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(u: PortalUser) {
    setEditing(u);
    setForm({
      full_name: u.full_name, email: u.email, password: '',
      role: u.role, sections: u.sections, is_active: u.is_active,
    });
    setError('');
    setModalOpen(true);
  }

  function toggleSection(key: string) {
    setForm(f => ({
      ...f,
      sections: f.sections.includes(key)
        ? f.sections.filter(s => s !== key)
        : [...f.sections, key],
    }));
  }

  async function save() {
    setError('');
    if (!form.full_name.trim()) { setError('Укажите имя сотрудника'); return; }
    if (!form.email.trim()) { setError('Укажите email'); return; }
    if (!editing && form.password.length < 6) {
      setError('Пароль не короче 6 символов'); return;
    }
    if (editing && form.password && form.password.length < 6) {
      setError('Пароль не короче 6 символов'); return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          full_name: form.full_name, email: form.email, role: form.role,
          sections: form.sections, is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/api/clients/${clientId}/portal-users/${editing.id}`, payload);
      } else {
        await api.post(`/api/clients/${clientId}/portal-users`, {
          full_name: form.full_name, email: form.email, password: form.password,
          role: form.role, sections: form.sections,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['portal-users', clientId] });
      setModalOpen(false);
    } catch (e) {
      setError(apiError(e, 'Не удалось сохранить сотрудника'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(u: PortalUser) {
    if (!window.confirm(`Удалить доступ сотрудника «${u.full_name}»?`)) return;
    try {
      await api.delete(`/api/clients/${clientId}/portal-users/${u.id}`);
      await queryClient.invalidateQueries({ queryKey: ['portal-users', clientId] });
    } catch (e) {
      alert(apiError(e, 'Ошибка удаления'));
    }
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Организационная структура</h3>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          <Icon name="plus" size={15} />Добавить сотрудника
        </button>
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--ink-4)', fontSize: 13, maxWidth: 680 }}>
        Сотрудники компании-клиента и их доступ к разделам портала. Управлять может только сотрудник вашей компании.
      </p>

      {isLoading ? (
        <div className="loading-bar"></div>
      ) : users.length === 0 ? (
        <div className="empty-tab">
          <div className="ei"><Icon name="users" size={24} /></div>
          <b>Сотрудники клиента не добавлены</b>
          <span>Добавьте сотрудника клиента, задайте ему пароль, роль и доступ к разделам портала.</span>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={openAdd}>
            <Icon name="plus" size={15} />Добавить сотрудника
          </button>
        </div>
      ) : (
        <div className="brief-grid">
          {users.map((u, i) => (
            <div key={u.id} className={`brief-card rise d${Math.min(i + 1, 6)}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ marginBottom: 2 }}>{u.full_name}</h4>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-4)', wordBreak: 'break-all' }}>{u.email}</div>
                </div>
                {u.is_active
                  ? <span className="pill pill-green"><span className="led" />Активен</span>
                  : <span className="pill pill-gray">Отключён</span>}
              </div>
              {u.role && <p style={{ marginTop: 10 }}>Роль: <b>{u.role}</b></p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {u.sections.length === 0
                  ? <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Разделы не открыты</span>
                  : u.sections.map(s => (
                    <span key={s} className="pill pill-gray" style={{ fontSize: 11.5 }}>
                      {SECTION_LABEL[s] || s}
                    </span>
                  ))}
              </div>
              <div className="bf-foot" style={{ marginTop: 14 }}>
                <span />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-soft btn-sm" onClick={() => openEdit(u)}>
                    <Icon name="edit" size={14} />Изменить
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(u)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: 520, width: '100%' }}>
            <h3 className="modal-title">{editing ? 'Изменить сотрудника' : 'Добавить сотрудника клиента'}</h3>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Имя сотрудника</label>
              <input className="form-input" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Иван Петров" />
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Email (логин)</label>
              <input className="form-input" type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ivan@client.ru" />
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">{editing ? 'Новый пароль' : 'Пароль'}</label>
              <input className="form-input" type="text" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editing ? 'Оставьте пустым, чтобы не менять' : 'Не короче 6 символов'} />
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
                Задайте пароль вручную и передайте его сотруднику клиента.
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Роль</label>
              <input className="form-input" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="Например: Руководитель проекта" />
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Доступ к разделам портала</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {SECTIONS.map(s => (
                  <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.sections.includes(s.key)} onChange={() => toggleSection(s.key)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            {editing && (
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Доступ активен
                </label>
              </div>
            )}

            {error && <p className="modal-text" style={{ color: 'var(--danger)' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Сохранение…' : (editing ? 'Сохранить' : 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
