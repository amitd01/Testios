import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Consultants from './pages/Consultants';
import Requisitions from './pages/Requisitions';
import RequisitionDetail from './pages/RequisitionDetail';
import BriefingChat from './pages/BriefingChat';
import InterviewBooking from './pages/InterviewBooking';
import Analytics from './pages/Analytics';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - no layout/auth */}
        <Route path="/briefing/:token" element={<BriefingChat />} />
        <Route path="/interview/:token" element={<InterviewBooking />} />

        {/* Authenticated routes */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/consultants" element={<Consultants />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/requisitions/:id" element={<RequisitionDetail />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
