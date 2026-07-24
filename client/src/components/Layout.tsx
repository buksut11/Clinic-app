import { ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Role } from '../lib/types';
import { useFloatingPanel, useCloseOnOutside } from './ui';
import {
  IconDashboard, IconPatients, IconCalendar, IconQueue, IconLab,
  IconBilling, IconReports, IconSettings, IconSearch, IconLogout, IconPharmacy,
} from './icons';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: <IconDashboard />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'PHARMACIST'] },
  { to: '/patients', key: 'nav.patients', icon: <IconPatients />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'PHARMACIST'] },
  { to: '/appointments', key: 'nav.appointments', icon: <IconCalendar />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
  { to: '/queue', key: 'nav.queue', icon: <IconQueue />, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE'] },
  { to: '/lab', key: 'nav.lab', icon: <IconLab />, roles: ['ADMIN', 'DOCTOR', 'NURSE'] },
  { to: '/pharmacy', key: 'nav.pharmacy', icon: <IconPharmacy />, roles: ['ADMIN', 'PHARMACIST'] },
  { to: '/billing', key: 'nav.billing', icon: <IconBilling />, roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/reports', key: 'nav.reports', icon: <IconReports />, roles: ['ADMIN'] },
  { to: '/settings', key: 'nav.settings', icon: <IconSettings />, roles: ['ADMIN'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, lang, dir, setLang } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { triggerRef: menuRef, panelRef: menuPanelRef, style: menuStyle } = useFloatingPanel(menuOpen, { align: 'end', rtl: dir === 'rtl' });
  useCloseOnOutside(menuOpen, () => setMenuOpen(false), [menuRef, menuPanelRef]);

  const items = NAV.filter((n) => user && n.roles.includes(user.role));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/patients?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="flex h-screen overflow-hidden p-3 gap-3">
      {/* Sidebar */}
      <aside className="glass flex w-60 flex-shrink-0 flex-col rounded-3xl shadow-lg">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md" style={{ background: 'linear-gradient(180deg,#2dd4bf,#0d9488)' }}>
            ✚
          </div>
          <span className="text-sm font-bold leading-tight text-slate-800">{t('app.name')}</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-white/80 text-brand-700 shadow-sm ring-1 ring-white/70'
                    : 'text-slate-600 hover:bg-white/50'
                }`
              }
            >
              {n.icon}
              <span>{t(n.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white/50">
            <IconLogout />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden gap-3">
        <header className="glass flex h-16 flex-shrink-0 items-center justify-between rounded-3xl px-5 shadow-sm">
          <form onSubmit={submitSearch} className="relative w-full max-w-md">
            <IconSearch className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-slate-400" />
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
            <div ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-full px-2 py-1.5 transition hover:bg-white/50">
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm" style={{ background: 'linear-gradient(180deg,#2dd4bf,#0d9488)' }}>
                  {user?.name?.charAt(0)}
                </div>
                <div className="text-start">
                  <div className="text-sm font-semibold text-slate-800">{user?.name}</div>
                  <div className="text-xs capitalize text-slate-400">{user?.role.toLowerCase()}</div>
                </div>
              </button>
              {menuOpen &&
                menuStyle &&
                createPortal(
                  <div
                    ref={menuPanelRef}
                    className="glass-strong w-44 rounded-2xl py-1.5 shadow-xl"
                    style={{ position: 'fixed', top: menuStyle.top, left: menuStyle.left, zIndex: 100 }}
                  >
                    <button onClick={() => { setMenuOpen(false); navigate('/change-password'); }} className="block w-full px-4 py-2 text-start text-sm text-slate-600 hover:bg-white/60">
                      Change password
                    </button>
                    <button onClick={logout} className="block w-full px-4 py-2 text-start text-sm text-red-600 hover:bg-white/60">
                      {t('nav.logout')}
                    </button>
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto rounded-3xl pe-1">
          <div className="p-3">{children}</div>
        </main>
      </div>
    </div>
  );
}
