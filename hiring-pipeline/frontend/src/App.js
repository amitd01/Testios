import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Consultants from './pages/Consultants';
import Requisitions from './pages/Requisitions';
import RequisitionDetail from './pages/RequisitionDetail';
import BriefingChat from './pages/BriefingChat';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route - no layout/auth */}
        <Route path="/briefing/:token" element={<BriefingChat />} />

        {/* Authenticated routes */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/consultants" element={<Consultants />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/requisitions/:id" element={<RequisitionDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
