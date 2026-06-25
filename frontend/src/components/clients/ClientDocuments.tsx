import { useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import Icon from '../Icon';

interface ClientDocument {
  id: number;
  title: string;
  original_filename: string;
  source_type: 'local' | 'yandex_disk';
  source_label: string;
  content_type: string;
  size_bytes: number;
  created_at_fmt: string;
}

type DocumentSectionKey = 'contract' | 'acts' | 'project_materials';

const DOCUMENT_SECTIONS: Array<{
  key: DocumentSectionKey;
  title: string;
  emptyText: string;
}> = [
  { key: 'contract', title: 'Договор с клиентом', emptyText: 'Договор с клиентом пока не добавлен.' },
  { key: 'acts', title: 'Акты', emptyText: 'Акты пока не добавлены.' },
  { key: 'project_materials', title: 'Материалы по проекту', emptyText: 'Материалов по проекту пока что нет.' },
];

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

function documentSectionKey(doc: ClientDocument): DocumentSectionKey {
  const title = doc.title.trim().toLowerCase();
  if (/приложени[ея]\s*(?:№\s*)?(?:1|2|1\s*,\s*2)/i.test(title) || title.includes('акт')) return 'acts';
  if (title.includes('агентский договор') || title.includes('договор')) return 'contract';
  return 'project_materials';
}

export default function ClientDocuments({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [addingYandex, setAddingYandex] = useState(false);
  const [showYandexForm, setShowYandexForm] = useState(false);
  const [yandexTitle, setYandexTitle] = useState('');
  const [yandexUrl, setYandexUrl] = useState('');
  const [error, setError] = useState('');

  const { data: docs = [], isLoading } = useQuery<ClientDocument[]>({
    queryKey: ['client-documents', clientId],
    queryFn: async () => (await api.get(`/api/clients/${clientId}/documents`)).data,
  });

  const docsBySection = DOCUMENT_SECTIONS.map(section => ({
    ...section,
    docs: docs.filter(doc => documentSectionKey(doc) === section.key),
  }));

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

  async function addYandexDocument(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAddingYandex(true);
    try {
      await api.post(`/api/clients/${clientId}/documents/yandex-disk`, {
        title: yandexTitle.trim(),
        url: yandexUrl.trim(),
      });
      setYandexTitle('');
      setYandexUrl('');
      setShowYandexForm(false);
      await queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    } catch (e) {
      setError(apiError(e, 'Не удалось добавить ссылку Яндекс Диска'));
    } finally {
      setAddingYandex(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Документы для клиента</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" disabled={addingYandex} onClick={() => setShowYandexForm(v => !v)}>
            <Icon name="paperclip" size={15} />Яндекс Диск
          </button>
          <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={15} />{uploading ? 'Загрузка…' : 'Загрузить файл'}
          </button>
        </div>
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--ink-4)', fontSize: 13, maxWidth: 680 }}>
        Файлы и публичные ссылки Яндекс Диска, доступные клиенту в портале (раздел «Документы и файлы»). Клиент может только скачать документ.
      </p>

      {showYandexForm && (
        <form onSubmit={addYandexDocument} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, alignItems: 'end', margin: '0 0 18px' }}>
          <label className="form-group" style={{ margin: 0 }}>
            <span className="form-label">Название</span>
            <input className="form-input" value={yandexTitle} maxLength={255}
              onChange={e => setYandexTitle(e.target.value)} disabled={addingYandex} required />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span className="form-label">Ссылка Яндекс Диска</span>
            <input className="form-input" type="url" value={yandexUrl}
              placeholder="https://disk.yandex.ru/..."
              onChange={e => setYandexUrl(e.target.value)} disabled={addingYandex} required />
          </label>
          <button className="btn btn-primary btn-sm" type="submit" style={{ justifySelf: 'start' }} disabled={addingYandex || !yandexTitle.trim() || !yandexUrl.trim()}>
            <Icon name="plus" size={15} />{addingYandex ? 'Добавление…' : 'Добавить'}
          </button>
        </form>
      )}

      {error && <p className="modal-text" style={{ color: 'var(--danger)' }}>{error}</p>}

      {isLoading ? (
        <div className="loading-bar"></div>
      ) : docs.length === 0 ? (
        <div className="empty-tab">
          <div className="ei"><Icon name="doc" size={24} /></div>
          <b>Документы не загружены</b>
          <span>Загрузите файл или добавьте ссылку Яндекс Диска — клиент увидит документ в портале и сможет скачать его.</span>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={15} />Загрузить файл
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 22 }}>
          {docsBySection.map((section, sectionIndex) => (
            <section key={section.key} style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink-2)' }}>{section.title}</h4>
                <span className="pill pill-gray" style={{ fontSize: 11.5 }}>{section.docs.length}</span>
              </div>
              {section.docs.length === 0 ? (
                <div className="empty-tab" style={{ padding: '22px 16px', alignItems: 'flex-start', textAlign: 'left' }}>
                  <span style={{ maxWidth: 'none' }}>{section.emptyText}</span>
                </div>
              ) : (
                <div className="brief-grid">
                  {section.docs.map((d, i) => (
                    <div key={d.id} className={`brief-card rise d${Math.min(sectionIndex * 2 + i + 1, 6)}`}>
                      <h4 style={{ wordBreak: 'break-word' }}>{d.title}</h4>
                      <p style={{ wordBreak: 'break-all' }}>{d.source_type === 'yandex_disk' ? 'Яндекс Диск' : d.original_filename}</p>
                      <div className="bf-foot" style={{ marginTop: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                          {d.source_type === 'yandex_disk' ? d.source_label : humanSize(d.size_bytes)} · {d.created_at_fmt}
                        </span>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(d)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
