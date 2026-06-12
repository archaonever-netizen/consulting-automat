import { QueryClient } from '@tanstack/react-query';

// Кэш данных между экранами: повторный заход на страницу в течение 30 секунд
// рисуется мгновенно из кэша; после — данные показываются сразу, а обновление
// происходит в фоне. Вынесен в отдельный модуль, чтобы api.ts мог сбрасывать
// кэш после мутаций (см. services/api.ts).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
