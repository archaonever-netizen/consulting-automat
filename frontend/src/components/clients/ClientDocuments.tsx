import { useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import Icon from '../Icon';

interface ClientDocument {
  id: number;
  title: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at_fmt: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function apiError(e: unknown, fallback: string): string {
  if (e instanceof AxiosError) {
    const detail = (e.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  }
  return fallback;
}

export default function ClientDocuments({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const { data: docs = [], isLoading } = useQuery<ClientDocument[]>({
    queryKey: ['client-documents', clientId],
    queryFn: async () => (await api.get(`/api/clients/${clientId}/documents`)).data,
  });

  async function upload(file: File) {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      await api.post(`/api/clients/${clientId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    } catch (e) {
      setError(apiError(e, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(doc: ClientDocument) {
    if (!window.confirm(`Удалить документ «${doc.title}»?`)) return;
    try {
      await api.delete(`/api/clients/${clientId}/documents/${doc.id}`);
      await queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    } catch (e) {
      alert(apiError(e, 'Ошибка удаления'));
    }
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Документы для клиента</h3>
        <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="plus" size={15} />{uploading ? 'Загрузка…' : 'Загрузить файл'}
        </button>
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--ink-4)', fontSize: 13, maxWidth: 680 }}>
        Файлы, доступные клиенту в портале (раздел «Документы и файлы»). Максимальный размер — 25 МБ.
      </p>

      {error && <p className="modal-text" style={{ color: 'var(--danger)' }}>{error}</p>}

      {isLoading ? (
        <div className="loading-bar"></div>
      ) : docs.length === 0 ? (
        <div className="empty-tab">
          <div className="ei"><Icon name="doc" size={24} /></div>
          <b>Документы не загружены</b>
          <span>Загрузите файлы (отчёты, презентации) — клиент увидит и скачает их в портале.</span>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={15} />Загрузить файл
          </button>
        </div>
      ) : (
        <div className="brief-grid">
          {docs.map((d, i) => (
            <div key={d.id} className={`brief-card rise d${Math.min(i + 1, 6)}`}>
              <h4 style={{ wordBreak: 'break-word' }}>{d.title}</h4>
              <p style={{ wordBreak: 'break-all' }}>{d.original_filename}</p>
              <div className="bf-foot" style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{humanSize(d.size_bytes)} · {d.created_at_fmt}</span>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(d)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
