import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DEMO_URL, HOME_NAV, NAV } from '../../lib/constants';
import {
  BookDemoButton,
  HomeHashLink,
  PricingEmailLink,
  RequestPricingButton,
} from './SiteCta';

type SiteNavProps = {
  scrolled: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenMeeting: () => void;
};

export function SiteNav({
  scrolled,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenMeeting,
}: SiteNavProps) {
  const { pathname } = useLocation();
  const onHome = pathname === '/';

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  const bookMeeting = (e: React.MouseEvent) => {
    e.preventDefault();
    onCloseMenu();
    onOpenMeeting();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <>
      <header className={`topnav ${scrolled ? 'is-solid' : ''}`}>
        <Link className="brand" to="/" onClick={onCloseMenu}>
          <img className="logo-mark" src="/favicon.svg" alt="" />
          <span>VYRO</span>
        </Link>
        <nav className="topnav__links" aria-label="Primary">
          {onHome
            ? HOME_NAV.map((item) => (
                <HomeHashLink
                  key={item.hash}
                  hash={item.hash}
                  onNavigate={onCloseMenu}
                >
                  {item.label}
                </HomeHashLink>
              ))
            : NAV.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={isActive(item.path) ? 'is-active' : ''}
                >
                  {item.label}
                </Link>
              ))}
        </nav>
        <div className="topnav__actions">
          {onHome ? (
            <>
              <RequestPricingButton
                className="nav-link-btn"
                onAfter={onCloseMenu}
              />
              <BookDemoButton className="nav-cta" onAfter={onCloseMenu}>
                <span>Book a Demo</span>
              </BookDemoButton>
            </>
          ) : (
            <>
              <Link className="link-quiet" to={DEMO_URL} onClick={onCloseMenu}>
                Live try-on
              </Link>
              <BookDemoButton className="btn btn--sm" onAfter={onCloseMenu}>
                <span>Talk to us</span>
              </BookDemoButton>
            </>
          )}
          <button
            type="button"
            className={`burger ${menuOpen ? 'is-open' : ''}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            <i />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.button
              type="button"
              className="drawer-backdrop"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMenu}
            />
            <motion.div
              className="drawer"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Link to="/" onClick={onCloseMenu}>
                Home
              </Link>
              {onHome
                ? HOME_NAV.map((item) => (
                    <HomeHashLink
                      key={item.hash}
                      hash={item.hash}
                      className="drawer-link"
                      onNavigate={onCloseMenu}
                    >
                      {item.label}
                    </HomeHashLink>
                  ))
                : NAV.map((item) => (
                    <Link key={item.path} to={item.path} onClick={onCloseMenu}>
                      {item.label}
                    </Link>
                  ))}
              {onHome ? (
                <>
                  <Link className="drawer-link" to={DEMO_URL} onClick={onCloseMenu}>
                    Live try-on
                  </Link>
                  <RequestPricingButton
                    className="drawer-link"
                    onAfter={onCloseMenu}
                  />
                  <BookDemoButton className="btn" onAfter={onCloseMenu} />
                </>
              ) : (
                <>
                  <button type="button" className="drawer-link" onClick={bookMeeting}>
                    Book a Meeting
                  </button>
                  <Link to={DEMO_URL} onClick={onCloseMenu}>
                    Live try-on
                  </Link>
                  <Link className="btn" to="/pricing" onClick={onCloseMenu}>
                    View pricing
                  </Link>
                </>
              )}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer footer--contact" id="contact">
      <span className="kicker">Contact</span>
      <h3>Let&apos;s Talk</h3>
      <p className="footer__lede">
        Interested in bringing virtual try-on to your business?
      </p>
      <div className="hero__cta footer__cta">
        <BookDemoButton />
        <PricingEmailLink />
      </div>
      <div className="contact-links">
        <PricingEmailLink className="contact-links__plain">hello@vyro.om</PricingEmailLink>
        <Link to={DEMO_URL}>Live try-on</Link>
      </div>
      <div className="foot-meta">
        <span>VYRO — AI VIRTUAL TRY-ON</span>
        <span>OMAN → GCC</span>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
