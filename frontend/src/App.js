import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from './utils/api';
import { useApi } from './hooks/useApi';
import Layout from './components/Layout';
import Welcome from './pages/Welcome';
import AuthCallback from './pages/AuthCallback';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Bills from './pages/Bills';
import Budgets from './pages/Budgets';
import Goals from './pages/Goals';
import Investments from './pages/Investments';
import CreditCards from './pages/CreditCards';
import Insights from './pages/Insights';
import Settings from './pages/Settings';
import Diagnostics from './pages/Diagnostics';
import SyncRunDetail from './pages/SyncRunDetail';

function ProtectedRoute({ children, user }) {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  return <Layout user={user}>{children}</Layout>;
}

export default function App() {
  const location = useLocation();
  const authed = isAuthenticated();
  const { data: userData, refetch } = useApi('/api/me', { skip: !authed });
  const user = userData?.user;

  // Public routes
  const publicPaths = ['/', '/auth/callback', '/auth/error', '/onboarding'];
  const isPublicRoute = publicPaths.some(p => location.pathname.startsWith(p));

  return (
    <Routes>
      <Route path="/" element={authed ? <Navigate to="/dashboard" /> : <Welcome />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/error" element={<AuthCallback />} />
      <Route path="/onboarding" element={authed ? <Onboarding /> : <Navigate to="/" />} />

      <Route path="/dashboard" element={<ProtectedRoute user={user}><Dashboard /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute user={user}><Transactions /></ProtectedRoute>} />
      <Route path="/bills" element={<ProtectedRoute user={user}><Bills /></ProtectedRoute>} />
      <Route path="/budgets" element={<ProtectedRoute user={user}><Budgets /></ProtectedRoute>} />
      <Route path="/goals" element={<ProtectedRoute user={user}><Goals /></ProtectedRoute>} />
      <Route path="/investments" element={<ProtectedRoute user={user}><Investments /></ProtectedRoute>} />
      <Route path="/cards" element={<ProtectedRoute user={user}><CreditCards /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute user={user}><Insights /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute user={user}><Settings user={user} onSync={refetch} /></ProtectedRoute>} />
      <Route path="/diagnostics" element={<ProtectedRoute user={user}><Diagnostics /></ProtectedRoute>} />
      <Route path="/diagnostics/run/:id" element={<ProtectedRoute user={user}><SyncRunDetail /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
