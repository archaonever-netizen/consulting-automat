import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/styles.css';
import Splash from './components/Splash';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import BriefFormPage from './pages/BriefFormPage';
import CompanyPage from './pages/CompanyPage';
import FunctionDetailPage from './pages/FunctionDetailPage';
import DepartmentDetailPage from './pages/DepartmentDetailPage';
import TasksPage from './pages/TasksPage';
import ChatPage from './pages/ChatPage';
import OrchestrationPage from './pages/OrchestrationPage';
import KnowledgePage from './pages/KnowledgePage';
import TrackerPage from './pages/TrackerPage';
import ProfilePage from './pages/ProfilePage';
import GoalsPage from './pages/GoalsPage';
import GoalDecompositionPage from './pages/GoalDecompositionPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
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
  );
}
