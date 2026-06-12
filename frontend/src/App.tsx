import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles/styles.css';
import Splash from './components/Splash';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';

// Ленивая загрузка страниц: код каждого экрана скачивается при первом заходе
// на него (и дальше берётся из кэша). Эйджер остаются только LoginPage и
// HomePage — это первые экраны после открытия приложения.
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const BriefFormPage = lazy(() => import('./pages/BriefFormPage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));
const FunctionDetailPage = lazy(() => import('./pages/FunctionDetailPage'));
const DepartmentDetailPage = lazy(() => import('./pages/DepartmentDetailPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const TrackerPage = lazy(() => import('./pages/TrackerPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const GoalDecompositionPage = lazy(() => import('./pages/GoalDecompositionPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const OrchestrationPage = lazy(() => import('./pages/OrchestrationPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

// Кэш данных между экранами: повторный заход на страницу в течение 30 секунд
// рисуется мгновенно из кэша; после — данные показываются сразу, а обновление
// происходит в фоне.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Splash />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="briefs/:briefId" element={<BriefFormPage />} />
          <Route path="company" element={<CompanyPage />} />
          <Route path="company/functions/:id" element={<FunctionDetailPage />} />
          <Route path="company/departments/:id" element={<DepartmentDetailPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="goals/:goalId" element={<GoalDecompositionPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="orchestration" element={<OrchestrationPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="tracker" element={<TrackerPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </QueryClientProvider>
  );
}
