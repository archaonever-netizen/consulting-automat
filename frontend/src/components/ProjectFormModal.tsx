import { useState, type FormEvent } from 'react';
import { AxiosError } from 'axios';
import Icon from './Icon';
import { buildProjectPayload, emptyProjectForm, type ProjectFormData } from '../pages/projects/logic';
import type { ProjectClientOption } from '../types/projects';

interface ProjectFormModalProps {
  clients: ProjectClientOption[];
  fixedClientId?: number;
  onClose: () => void;
  onSubmit: (payload: { name: string; client_id: number; description: string | null }) => Promise<void>;
}

export default function ProjectFormModal({ clients, fixedClientId, onClose, onSubmit }: ProjectFormModalProps) {
  const initialClientId = fixedClientId ? String(fixedClientId) : clients[0] ? String(clients[0].id) : '';
  const [form, setForm] = useState<ProjectFormData>(emptyProjectForm(initialClientId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fixedClient = fixedClientId ? clients.find(client => client.id === fixedClientId) : null;

  function setField<K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = buildProjectPayload({
      ...form,
      client_id: fixedClientId ? String(fixedClientId) : form.client_id,
    });
    if (!payload) {
      setError('Заполните название проекта и выберите клиента.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : null;
      setError(detail || 'Не удалось создать проект');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card project-modal">
        <h3 className="modal-title">Новый проект</h3>
        <p className="modal-text">Проект всегда создаётся внутри конкретного клиента.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="project_name">Название проекта</label>
            <input
              id="project_name"
              type="text"
              className="form-input"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              required
              autoFocus
              placeholder="Например, Проектирование целевой модели"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="project_client">Клиент</label>
            {fixedClientId ? (
              <div className="project-fixed-client">
                <Icon name="users" size={16} />
                <span>{fixedClient?.name || 'Клиент выбран'}</span>
              </div>
            ) : (
              <select
                id="project_client"
                className="form-input"
                value={form.client_id}
                onChange={e => setField('client_id', e.target.value)}
                required
              >
                <option value="" disabled>Выберите клиента</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="project_description">Описание</label>
            <textarea
              id="project_description"
              className="form-textarea"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Кратко опишите цель, контекст или границы проекта"
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={busy || clients.length === 0}>
              {busy ? 'Создание...' : 'Создать проект'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
