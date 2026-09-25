import { NavLink, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './Nav.css';

const DEMO_URL = 'http://vyro.devsynx.com/';

const LINKS = [
  { to: '/about', label: 'About' },
  { to: '/categories', label: 'Categories' },
  { to: '/why', label: 'Why Vyro' },
  { to: '/demo', label: 'Book a Demo' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className={`nav ${scrolled ? 'nav--scrolled' : ''}`}>
      <div className="nav__inner container">
        <Link to="/" className="nav__brand" onClick={() => setOpen(false)}>
          <img src="/brand/icon-dark.PNG" alt="" width={28} height={28} />
          <span>VYRO</span>
        </Link>

        <nav className={`nav__links ${open ? 'is-open' : ''}`} aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <div className="nav__mobile-actions">
            <a
              className="btn btn--ghost"
              href={DEMO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              Try On
            </a>
            <Link className="btn btn--primary" to="/demo" onClick={() => setOpen(false)}>
              Book a Demo
            </Link>
          </div>
        </nav>

        <div className="nav__actions">
          <a
            className="btn btn--ghost nav__try"
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
          >
            Try On
          </a>
          <Link className="btn btn--primary nav__cta" to="/demo">
            Book a Demo
          </Link>
        </div>

        <button
          type="button"
          className={`nav__burger ${open ? 'is-open' : ''}`}
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
