import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import api from '../services/api';
import AgentRequestModal, { LinkRequest } from '../components/AgentRequestModal';

interface ClientOption {
  id: number;
  name: string;
}

interface TraceEntry {
  node: string;
  status: string;
  ts: string;
}

interface AnalysisRow {
  function_name: string;
  status: string;
}

interface OrchestrationRead {
  id: number;
  status: string;
  error: string | null;
  results: { consolidated_plan?: string } | null;
  analyses: AnalysisRow[];
}

type Mode = 'network' | 'pipeline';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function OrchestrationPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<Mode>('network');
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [plan, setPlan] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Очередь запросов сети на создание связей (показываются модалками по одному)
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const traceEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollCancelRef = useRef<{ v: boolean } | null>(null);
  // были ли созданы связи в ходе разбора запросов → нужен перезапуск прогона
  const createdLinkRef = useRef(false);

  useEffect(() => {
    api
      .get<ClientOption[]>('/api/clients')
      .then(r => {
        setClients(r.data);
        if (r.data.length > 0) setClientId(r.data[0].id);
      })
      .catch(() => setError('Не удалось загрузить список клиентов'));
  }, []);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trace]);

  // Последний шаг показывает, какой отдел/функция сейчас в работе
  const activeNode = running && trace.length > 0 ? trace[trace.length - 1].node : null;

  function start() {
    if (mode === 'network') startNetwork();
    else startPipeline();
  }

  // ── Сеть агентов: live через SSE ──
  async function startNetwork() {
    if (!clientId || !description.trim() || running) return;
    setRunning(true);
    setTrace([]);
    setPlan('');
    setError(null);
    setRequests([]);
    createdLinkRef.current = false;

    let orchestrationId: number;
    try {
      const { data } = await api.post<{ orchestration_id: number }>(
        `/api/agent/network/${clientId}`,
        { description: description.trim(), mode: 'network' }
      );
      orchestrationId = data.orchestration_id;
    } catch {
      setError('Не удалось создать прогон');
      setRunning(false);
      return;
    }

    abortRef.current = new AbortController();
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${API_BASE}/api/agent/orchestration/${orchestrationId}/stream`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortRef.current.signal,
        }
      );
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // SSE-события разделены '\n\n'; сетевой чанк может разорвать событие.
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          for (const line of evt.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'request') {
                setRequests(prev => [...prev, parsed as LinkRequest]);
              } else if (parsed.node && parsed.status) {
                setTrace(prev => [...prev, parsed as TraceEntry]);
              }
              if (parsed.error) setError(parsed.error);
              if (parsed.done) setPlan(parsed.consolidated_plan || '');
            } catch {
              /* неполный фрагмент — игнор */
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError('Ошибка соединения с сетью агентов');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  // ── Конвейер v1: фон через Celery + polling ──
  async function startPipeline() {
    if (!clientId || !description.trim() || running) return;
    setRunning(true);
    setTrace([]);
    setPlan('');
    setError(null);

    let orchestrationId: number;
    try {
      const { data } = await api.post<{ orchestration_id: number }>(
        `/api/agent/project/${clientId}`,
        { description: description.trim(), mode: 'pipeline' }
      );
      orchestrationId = data.orchestration_id;
    } catch {
      setError('Не удалось запустить конвейер (нужен запущенный Celery-воркер)');
      setRunning(false);
      return;
    }

    const cancelled = { v: false };
    pollCancelRef.current = cancelled;
    try {
      while (!cancelled.v) {
        await sleep(2000);
        if (cancelled.v) break;
        try {
          const { data } = await api.get<OrchestrationRead>(
            `/api/agent/orchestration/${orchestrationId}`
          );
          // показываем статусы функций как «ход работы»
          setTrace(
            data.analyses.map(a => ({ node: a.function_name, status: a.status, ts: '' }))
          );
          if (data.status === 'completed') {
            setPlan(data.results?.consolidated_plan || '');
            break;
          }
          if (data.status === 'failed') {
            setError(data.error || 'Прогон завершился ошибкой');
            break;
          }
        } catch {
          /* временная ошибка сети — продолжаем опрос */
        }
      }
    } finally {
      setRunning(false);
      pollCancelRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    if (pollCancelRef.current) pollCancelRef.current.v = true;
  }

  // Снять первый запрос с очереди; если очередь опустела и были созданы
  // связи — перезапустить прогон с обновлённой топологией.
  function popRequest() {
    setRequests(prev => {
      const next = prev.slice(1);
      if (next.length === 0 && createdLinkRef.current) {
        createdLinkRef.current = false;
        // перезапуск после закрытия текущего рендера
        setTimeout(() => startNetwork(), 0);
      }
      return next;
    });
  }

  async function assignRequest(departmentId: number) {
    const req = requests[0];
    if (!req) return;
    try {
      await api.post('/api/company/links', {
        function_id: req.function_id,
        department_id: departmentId,
        relation_type: req.relation_type,
        description: null,
      });
      createdLinkRef.current = true;
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Не удалось создать связь');
    }
    popRequest();
  }

  return (
    <div className="orch-page">
      <div className="orch-header">
        <h1 className="page-title">Сеть агентов</h1>
        <p className="page-subtitle">
          Отделы-агенты выполняют функции и обращаются к смежным отделам. Ниже —
          живой ход работы: кто над чем работает прямо сейчас.
        </p>
      </div>

      <div className="orch-form card">
        <div className="form-row">
          <label className="form-label">Режим</label>
          <div className="orch-modes">
            <button
              type="button"
              className={`orch-mode${mode === 'network' ? ' active' : ''}`}
              onClick={() => !running && setMode('network')}
              disabled={running}
            >
              Сеть агентов (live)
            </button>
            <button
              type="button"
              className={`orch-mode${mode === 'pipeline' ? ' active' : ''}`}
              onClick={() => !running && setMode('pipeline')}
              disabled={running}
            >
              Конвейер (фон)
            </button>
          </div>
          {mode === 'pipeline' && (
            <p className="orch-hint">Требует запущенный Celery-воркер и Redis.</p>
          )}
        </div>

        <div className="form-row">
          <label className="form-label">Клиент</label>
          <select
            className="form-input"
            value={clientId ?? ''}
            onChange={e => setClientId(Number(e.target.value))}
            disabled={running}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Описание проекта</label>
          <textarea
            className="form-input"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Опишите задачу проекта — сеть определит нужные функции и отделы..."
            disabled={running}
          />
        </div>

        <div className="orch-actions">
          {running ? (
            <button className="btn btn-secondary" onClick={stop}>
              Остановить
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={start}
              disabled={!clientId || !description.trim()}
            >
              {mode === 'network' ? 'Запустить сеть' : 'Запустить конвейер'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="orch-error">{error}</div>}

      {(running || trace.length > 0) && (
        <div className="orch-progress card">
          <div className="orch-progress-header">
            <h3>Ход работы</h3>
            {activeNode && (
              <span className="orch-active">
                <span className="orch-spinner" /> сейчас: {activeNode}
              </span>
            )}
          </div>
          <ul className="orch-trace">
            {trace.map((t, i) => {
              const last = i === trace.length - 1;
              const failed = /ошибк|fail/i.test(t.status);
              return (
                <li
                  key={i}
                  className={
                    'orch-trace-item' +
                    (running && last ? ' active' : '') +
                    (failed ? ' failed' : '')
                  }
                >
                  <span className="orch-trace-node">{t.node}</span>
                  <span className="orch-trace-status">{t.status}</span>
                </li>
              );
            })}
            <div ref={traceEndRef} />
          </ul>
        </div>
      )}

      {plan && (
        <div className="orch-plan card">
          <h3>Консолидированный план</h3>
          <div className="orch-plan-body">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        </div>
      )}

      {!running && requests.length > 0 && (
        <AgentRequestModal
          request={requests[0]}
          index={0}
          total={requests.length}
          onAssign={assignRequest}
          onSkip={popRequest}
        />
      )}
    </div>
  );
}
