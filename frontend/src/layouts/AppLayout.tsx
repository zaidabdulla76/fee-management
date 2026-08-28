import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useYear } from '../context/YearContext';
import { BrandMark } from '../components/BrandLogo';
import { Button } from '../components/ui';
import { INSTITUTION_NAME } from '../brand';

const IDLE_MS = 30 * 60 * 1000; // 30 minutes

/** Hover timing — tuned to feel deliberate, not twitchy */
const SIDEBAR_ENTER_DELAY_MS = 90;
const SIDEBAR_LEAVE_DELAY_MS = 380;
const SIDEBAR_LABEL_DELAY_MS = 280;

/** Fewer top-level items: Setup holds Years + Settings */
const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/students', label: 'Students' },
  { to: '/collect', label: 'Collect fees' },
  { to: '/reports', label: 'Reports' },
  { to: '/setup', label: 'Setup' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { years, selectedYearId, setSelectedYearId } = useYear();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarLabels, setSidebarLabels] = useState(false);
  const isHovering = useRef(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout>>();
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const labelTimer = useRef<ReturnType<typeof setTimeout>>();

  function clearSidebarTimers() {
    clearTimeout(enterTimer.current);
    clearTimeout(leaveTimer.current);
    clearTimeout(labelTimer.current);
  }

  function openSidebar() {
    clearTimeout(leaveTimer.current);
    clearTimeout(enterTimer.current);
    clearTimeout(labelTimer.current);

    enterTimer.current = setTimeout(() => {
      if (!isHovering.current) return;
      setSidebarOpen(true);
      labelTimer.current = setTimeout(() => {
        if (!isHovering.current) return;
        setSidebarLabels(true);
      }, SIDEBAR_LABEL_DELAY_MS);
    }, SIDEBAR_ENTER_DELAY_MS);
  }

  function closeSidebar() {
    clearTimeout(enterTimer.current);
    clearTimeout(labelTimer.current);
    setSidebarLabels(false);

    leaveTimer.current = setTimeout(() => {
      if (isHovering.current) return;
      setSidebarOpen(false);
    }, SIDEBAR_LEAVE_DELAY_MS);
  }

  function handleSidebarEnter() {
    isHovering.current = true;
    clearTimeout(leaveTimer.current);

    if (sidebarOpen) {
      if (!sidebarLabels) {
        clearTimeout(labelTimer.current);
        labelTimer.current = setTimeout(() => {
          if (!isHovering.current) return;
          setSidebarLabels(true);
        }, SIDEBAR_LABEL_DELAY_MS);
      }
      return;
    }

    openSidebar();
  }

  function handleSidebarLeave() {
    isHovering.current = false;
    closeSidebar();
  }

  useEffect(() => () => clearSidebarTimers(), []);

  // Auto sign-out after idle (privacy)
  useEffect(() => {
    let timer = window.setTimeout(forceLogout, IDLE_MS);

    function bump() {
      window.clearTimeout(timer);
      timer = window.setTimeout(forceLogout, IDLE_MS);
    }

    function forceLogout() {
      logout();
      navigate('/login', { replace: true });
    }

    const opts = { passive: true };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, opts));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [logout, navigate]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const sidebar = (
    <>
      <div className="sidebar-brand border-b border-white/10">
        <div className={`sidebar-brand-full ${sidebarLabels ? 'sidebar-brand-full--visible' : ''}`}>
          <BrandMark />
        </div>
        <div
          className={`sidebar-brand-mini ${sidebarLabels ? '' : 'sidebar-brand-mini--visible'}`}
          title={INSTITUTION_NAME}
        >
          <BrandMark compact />
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={link.label}
            className={({ isActive }) =>
              `sidebar-nav-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                isActive ? 'sidebar-nav-link--active' : 'text-slate-300'
              }`
            }
          >
            <span className="sidebar-nav-short" aria-hidden={sidebarLabels}>
              {link.label.charAt(0)}
            </span>
            <span
              className={`sidebar-nav-full ${sidebarLabels ? 'sidebar-nav-full--visible' : ''}`}
            >
              {link.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        <div className={`sidebar-user ${sidebarLabels ? 'sidebar-user--visible' : ''}`}>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Signed in</p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-200">{user?.username}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-footer-btn w-full"
          onClick={handleLogout}
          title="Sign out"
        >
          <span className="sidebar-nav-short" aria-hidden={sidebarLabels}>
            Out
          </span>
          <span className={`sidebar-nav-full ${sidebarLabels ? 'sidebar-nav-full--visible' : ''}`}>
            Sign out
          </span>
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-full">
      {/* Keeps main content still — expanded sidebar overlays instead of pushing */}
      <div className="sidebar-gutter shrink-0" aria-hidden="true" />

      <aside
        className={`sidebar-aside flex flex-col overflow-hidden bg-sidebar text-white ${
          sidebarOpen ? 'sidebar-aside--expanded' : 'sidebar-aside--collapsed'
        }`}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
        onFocusCapture={handleSidebarEnter}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            handleSidebarLeave();
          }
        }}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <label
                htmlFor="year-switcher"
                className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted"
              >
                School year
              </label>
              <select
                id="year-switcher"
                value={selectedYearId || ''}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="relative z-20 max-w-[16rem] rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              >
                {!years.length ? <option value="">No years yet</option> : null}
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year_name} ({y.status === 'Active' ? 'Current' : 'Closed'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
