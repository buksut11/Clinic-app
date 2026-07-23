import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Role } from '../lib/types';
import {
  IconDashboard, IconPatients, IconCalendar, IconQueue, IconLab,
  IconBilling, IconReports, IconSettings, IconSearch, IconLogout,
} from './icons';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: <IconDashboard />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE'] },
  { to: '/patients', key: 'nav.patients', icon: <IconPatients />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE'] },
  { to: '/appointments', key: 'nav.appointments', icon: <IconCalendar />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
  { to: '/queue', key: 'nav.queue', icon: <IconQueue />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE'] },
  { to: '/lab', key: 'nav.lab', icon: <IconLab />, roles: ['ADMIN', 'DOCTOR', 'NURSE'] },
  { to: '/billing', key: 'nav.billing', icon: <IconBilling />, roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/reports', key: 'nav.reports', icon: <IconReports />, roles: ['ADMIN'] },
  { to: '/settings', key: 'nav.settings', icon: <IconSettings />, roles: ['ADMIN'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter((n) => user && n.roles.includes(user.role));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/patients?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 flex-shrink-0 flex-col border-e border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            ✚
          </div>
          <span className="text-sm font-bold leading-tight text-slate-800">{t('app.name')}</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {n.icon}
              <span>{t(n.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <IconLogout />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <form onSubmit={submitSearch} className="relative w-full max-w-md">
            <IconSearch className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input ps-9"
              placeholder="Search patients by name, phone, or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="btn-secondary px-3 py-1.5 text-xs"
              title="Toggle language"
            >
              {lang === 'en' ? 'العربية' : 'English'}
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {user?.name?.charAt(0)}
                </div>
                <div className="text-start">
                  <div className="text-sm font-medium text-slate-800">{user?.name}</div>
                  <div className="text-xs capitalize text-slate-400">{user?.role.toLowerCase()}</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute end-0 mt-2 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
                  <button onClick={() => { setMenuOpen(false); navigate('/change-password'); }} className="block w-full px-4 py-2 text-start text-sm text-slate-600 hover:bg-slate-50">
                    Change password
                  </button>
                  <button onClick={logout} className="block w-full px-4 py-2 text-start text-sm text-red-600 hover:bg-slate-50">
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
