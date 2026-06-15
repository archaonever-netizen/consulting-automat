import axios from 'axios';
import { queryClient } from './queryClient';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Какие кэшированные данные устаревают после изменений по этим адресам.
// Любая успешная мутация (POST/PUT/PATCH/DELETE) сбрасывает связанные ключи —
// страницам не нужно помнить об этом самим.
const INVALIDATION_RULES: Array<[RegExp, string[]]> = [
  [/^\/api\/clients/, ['clients', 'home']],
  [/^\/api\/projects/, ['projects', 'clients', 'home']],
  [/^\/api\/briefs/, ['clients', 'home']],
  [/^\/api\/company/, ['company']],
  [/^\/api\/bots/, ['bots']],
  [/^\/api\/knowledge/, ['knowledge', 'knowledge-sources']],
  [/^\/api\/goals/, ['goals']],
  [/^\/api\/tasks/, ['tasks']],
  [/^\/api\/secretary/, ['tasks']],
];

api.interceptors.response.use(
  (response) => {
    const method = (response.config.method || '').toLowerCase();
    if (method && method !== 'get' && method !== 'head') {
      const url = response.config.url || '';
      for (const [pattern, keys] of INVALIDATION_RULES) {
        if (pattern.test(url)) {
          for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
    }
    return response;
  },
  (error) => {
    // 401 от самого логина — это «неверный пароль»: отдаём ошибку форме,
    // НЕ перезагружая страницу (иначе пользователь не увидит сообщение).
    const isLoginRequest = (error.config?.url || '').includes('/api/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
