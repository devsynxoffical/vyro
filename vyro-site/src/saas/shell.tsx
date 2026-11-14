import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, LogOut, Search, Settings } from 'lucide-react';
import { ago, logoUrl, noticeTone, supabase, type Notice } from './api';
import { useAuth } from './auth';
import { Avatar, Button, Empty, Popover } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Match the path exactly (for index routes) */
  end?: boolean;
}

export interface Crumb {
  label: string;
  to?: string;
}

const CrumbCtx = createContext<(c: Crumb[]) => void>(() => {});

/** Pages call this to say where they are; shown in the top bar. */
export function useCrumbs(crumbs: Crumb[]) {
  const set = useContext(CrumbCtx);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(JSON.parse(key) as Crumb[]);
  }, [key, set]);
}

export function AppShell({
  nav,
  section,
  settingsTo,
  identity,
  search,
}: {
  nav: NavItem[];
  section: string;
  settingsTo: string;
  /** Name and optional logo shown in the user block */
  identity: { name: string; logo?: string | null };
  search?: boolean;
}) {
  const { session, profile, signOut } = useAuth();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const { pathname } = useLocation();
  const email = session?.user.email ?? '';
  const person = profile?.full_name || email;

  const userMenu = (close: () => void) => (
    <div className="vy-menu">
      <div className="vy-menu__head">
        <strong>{person}</strong>
        <small>{email}</small>
      </div>
      <Link to={settingsTo} onClick={close}>
        <Settings /> Settings
      </Link>
      <button type="button" onClick={() => void signOut()}>
        <LogOut /> Sign out
      </button>
    </div>
  );

  return (
    <CrumbCtx.Provider value={setCrumbs}>
      <div className="vy vy-shell">
        <aside className="vy-rail">
          <Link to={nav[0].to} className="vy-rail__brand">
            <span className="vy-brandmark">VYRO</span> <small>{section}</small>
          </Link>
          <div>
            <div className="vy-rail__section">Workspace</div>
            <nav aria-label="Main">
              {nav.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} title={n.label} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                  {n.icon}
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="vy-rail__foot">
            <Popover
              align="up"
              trigger={(p) => (
                <button type="button" className="vy-rail__user" aria-label="Account menu" {...p}>
                  <Avatar name={identity.name} src={identity.logo} round={!identity.logo} />
                  <span className="vy-rail__user-text">
                    <strong>{identity.name}</strong>
                    <small>{person}</small>
                  </span>
                </button>
              )}
            >
              {userMenu}
            </Popover>
          </div>
        </aside>

        <div className="vy-work">
          <header className="vy-topbar">
            <Link to={nav[0].to} className="vy-topbar__brand vy-brandmark">
              VYRO
            </Link>
            <nav className="vy-topbar__crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={c.label + i} style={{ display: 'contents' }}>
                  {i > 0 && <ChevronRight size={14} />}
                  {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <strong>{c.label}</strong>}
                </span>
              ))}
            </nav>
            <div className="vy-topbar__spacer" />
            {search && <ClientSearch />}
            <Inbox role={profile?.role ?? 'client'} />
            <div style={{ display: 'contents' }} className="vy-topbar__me">
              <Popover
                trigger={(p) => (
                  <button type="button" className="vy-iconbtn vy-only-mobile" aria-label="Account menu" {...p}>
                    <Avatar name={identity.name} src={identity.logo} />
                  </button>
                )}
              >
                {userMenu}
              </Popover>
            </div>
          </header>
          {/* key: replay the entrance animation on each navigation */}
          <main className="vy-page" key={pathname}>
            <Outlet />
          </main>
        </div>

        <nav className="vy-tabbar" aria-label="Main">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </CrumbCtx.Provider>
  );
}

/** Notifications from the database, with unread state. */
function Inbox({ role }: { role: 'admin' | 'client' }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('audience', role)
      .order('created_at', { ascending: false })
      .limit(20);
    const list = (data ?? []) as Notice[];
    setItems(list);
    if (role === 'admin' && list.length) {
      const ids = [...new Set(list.map((n) => n.company_id).filter(Boolean))] as string[];
      const { data: cs } = await supabase.from('companies').select('id, name').in('id', ids);
      setNames(new Map(((cs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])));
    }
  }, [role]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const unread = items.filter((n) => !n.read_at);
  const markRead = async () => {
    if (!unread.length) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from('notifications').update({ read_at: now }).in('id', unread.map((n) => n.id));
  };

  return (
    <Popover
      trigger={(p) => (
        <button type="button" className="vy-iconbtn" aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} {...p}>
          <Bell />
          {unread.length > 0 && <span className="vy-iconbtn__dot" />}
        </button>
      )}
    >
      {(close) => (
        <div className="vy-inbox">
          <div className="vy-panel__head">
            <h2>Notifications</h2>
            {unread.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void markRead()}>
                Mark all read
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <Empty icon={<Bell />} title="Nothing yet">
              Payment results, cancellations and renewals appear here.
            </Empty>
          ) : (
            <ul className="vy-feed vy-inbox__list">
              {items.map((n) => {
                const tone = noticeTone(n.kind);
                const who = n.company_id ? names.get(n.company_id) : null;
                return (
                  <li key={n.id} style={{ opacity: n.read_at ? 0.72 : 1 }}>
                    <span className={`vy-feed__dot ${tone ? `vy-feed__dot--${tone}` : ''}`} />
                    <strong>
                      {role === 'admin' && n.company_id ? (
                        <Link to={`/admin/clients/${n.company_id}`} onClick={close}>
                          {who ? `${who}: ` : ''}
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </strong>
                    <time>{ago(n.created_at)}</time>
                    {n.body && <p>{n.body}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

interface Hit {
  id: string;
  name: string;
  store_name: string | null;
  logo_path: string | null;
}

/** Jump to any client from anywhere in the admin console. Press "/" to focus. */
function ClientSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, '');
    if (!term) return setHits([]);
    const timer = setTimeout(() => {
      void supabase
        .from('companies')
        .select('id, name, store_name, logo_path')
        .or(`name.ilike.%${term}%,store_name.ilike.%${term}%`)
        .limit(6)
        .then(({ data }) => {
          setHits((data ?? []) as Hit[]);
          setCursor(0);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setQ('');
    setOpen(false);
    input.current?.blur();
    navigate(`/admin/clients/${hit.id}`);
  };

  return (
    <div className="vy-pop vy-search vy-only-desktop" style={{ flex: '0 1 280px' }}>
      <Search />
      <input
        ref={input}
        value={q}
        placeholder="Find a client"
        aria-label="Find a client"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(hits.length - 1, c + 1));
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1));
          else if (e.key === 'Enter') go(hits[cursor]);
          else if (e.key === 'Escape') input.current?.blur();
          else return;
          e.preventDefault();
        }}
      />
      {!q && <kbd>/</kbd>}
      {open && q.trim() && (
        <div className="vy-pop__panel vy-pop__panel--left" style={{ width: '100%', minWidth: 260 }}>
          {hits.length === 0 ? (
            <p className="vy-muted vy-small" style={{ padding: 12 }}>
              No client matches “{q.trim()}”.
            </p>
          ) : (
            <div className="vy-menu" role="listbox">
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className={i === cursor ? 'is-cursor' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(h)}
                  style={{ minHeight: 44 }}
                >
                  <Avatar name={h.name} src={logoUrl(h.logo_path)} />
                  <span>
                    {h.name}
                    {h.store_name && h.store_name !== h.name && <small className="vy-muted"> · {h.store_name}</small>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
