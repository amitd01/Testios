import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Layout.css';

const navItems = [
  { path: '/dashboard', icon: '◻', label: 'Dashboard' },
  { path: '/transactions', icon: '↕', label: 'Transactions' },
  { path: '/bills', icon: '📄', label: 'Bills' },
  { path: '/budgets', icon: '📊', label: 'Budgets' },
  { path: '/goals', icon: '🎯', label: 'Goals' },
  { path: '/investments', icon: '📈', label: 'Investments' },
  { path: '/cards', icon: '💳', label: 'Cards' },
  { path: '/insights', icon: '💡', label: 'Insights' },
  { path: '/diagnostics', icon: '🔍', label: 'Diagnostics' },
  { path: '/settings', icon: '⚙', label: 'Settings' },
];

export default function Layout({ children, user }) {
  const location = useLocation();

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">₹</span>
          <span className="logo-text">PFM</span>
        </div>
        <div className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.[0] || '?'}</div>
          <span className="user-email">{user?.email || ''}</span>
        </div>
      </nav>
      <main className="main-content">
        <header className="top-bar">
          <h1 className="page-title">
            {navItems.find(i => location.pathname.startsWith(i.path))?.label || 'PFM'}
          </h1>
          <div className="sync-status">
            {user?.lastSync ? (
              <span className="sync-text">Last synced: {new Date(user.lastSync).toLocaleString('en-IN')}</span>
            ) : (
              <span className="sync-text">Not synced yet</span>
            )}
            <span className={`sync-dot ${user?.gmailConnected ? 'connected' : 'disconnected'}`} />
          </div>
        </header>
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}
