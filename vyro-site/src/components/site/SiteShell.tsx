import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GradSvg } from './GradSvg';
import { IntroCurtain } from './IntroCurtain';
import { MeetingModal } from './MeetingModal';
import { RedesignNav } from './RedesignNav';
import { SiteFooter, SiteNav } from './SiteNav';
import { scrollToContactSection } from './SiteCta';
import { pageTransition } from '../../lib/motion';
import '../../pages/Landing.css';
import '../../pages/Redesign.css';

function PageMain({
  isHome,
  reduce,
  children,
}: {
  isHome: boolean;
  reduce: boolean | null;
  children: ReactNode;
}) {
  if (isHome) {
    return <main>{children}</main>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key="inner"
        initial={pageTransition.initial}
        animate={pageTransition.animate}
        exit={pageTransition.exit}
        transition={{ duration: reduce ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}

export function SiteShell() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const reduce = useReducedMotion();
  const location = useLocation();
  const isTryOn = location.pathname === '/try-on';
  const isHome = location.pathname === '/';

  useEffect(() => {
    setMenuOpen(false);
    if (location.pathname !== '/' || !location.hash) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (location.pathname !== '/' || location.hash !== '#contact') return;
    const id = window.requestAnimationFrame(() => {
      scrollToContactSection();
    });
    return () => window.cancelAnimationFrame(id);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100;
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.width = `${pct}%`;
      setNavScrolled(window.scrollY > (isHome ? 40 : 32));
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => document.removeEventListener('scroll', onScroll);
  }, [isHome]);

  useEffect(() => {
    const open = () => setMeetingOpen(true);
    window.addEventListener('vyro:open-meeting', open);
    return () => window.removeEventListener('vyro:open-meeting', open);
  }, []);

  if (isTryOn) {
    return (
      <div className="landing landing--tryon">
        <PageMain isHome={false} reduce={reduce} key={location.pathname}>
          <Outlet />
        </PageMain>
        <MeetingModal open={meetingOpen} onClose={() => setMeetingOpen(false)} />
      </div>
    );
  }

  return (
    <div className={`landing ${isHome ? 'landing--redesign' : ''}`}>
      <IntroCurtain />
      <div className="progress-bar" id="progressBar" />
      <GradSvg />
      <div className="dotgrid" aria-hidden />
      {isHome ? (
        <>
          <div className="blob blob1" aria-hidden />
          <div className="blob blob2" aria-hidden />
          <div className="blob blob3" aria-hidden />
        </>
      ) : (
        <div className="ambiance" aria-hidden>
          <span className="orb orb-a blob1" />
          <span className="orb orb-b blob2" />
          <span className="orb orb-c blob3" />
          <span className="noise" />
        </div>
      )}

      {isHome ? (
        <RedesignNav scrolled={navScrolled} />
      ) : (
        <SiteNav
          scrolled={navScrolled}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onCloseMenu={() => setMenuOpen(false)}
          onOpenMeeting={() => setMeetingOpen(true)}
        />
      )}

      <PageMain isHome={isHome} reduce={reduce} key={location.pathname}>
        <Outlet />
      </PageMain>

      {!isHome ? <SiteFooter /> : null}
      <MeetingModal open={meetingOpen} onClose={() => setMeetingOpen(false)} />
    </div>
  );
}
