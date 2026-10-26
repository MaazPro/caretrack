import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth';
import type { Role } from './types';

const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(module => ({ default: module.DashboardPage })));

function Home() { const { user } = useAuth(); return <Navigate to={user?.role === 'ADMIN' ? '/admin' : user ? '/customer' : '/login'} replace />; }
function Protected({ role }: { role: Role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? <DashboardPage role={role} /> : <Home />;
}
export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><Spin size="large" /></div>;
  return <Suspense fallback={<div className="app-loading"><Spin size="large" /></div>}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={user ? <Home /> : <LoginPage />} />
    <Route path="/customer" element={<Protected role="CUSTOMER" />} />
    <Route path="/admin" element={<Protected role="ADMIN" />} />
    <Route path="*" element={<Home />} />
  </Routes></Suspense>;
}
