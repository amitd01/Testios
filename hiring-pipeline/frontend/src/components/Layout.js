import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/consultants', label: 'Consultants', icon: Users },
  { to: '/requisitions', label: 'Requisitions', icon: Briefcase },
];

function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: 220, background: '#2d3436', color: '#fff', padding: '20px 0',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '0 20px', marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Hiring Pipeline</h2>
        </div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', color: isActive ? '#74b9ff' : '#b2bec3',
              textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
              background: isActive ? 'rgba(116,185,255,0.1)' : 'transparent',
            })}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
