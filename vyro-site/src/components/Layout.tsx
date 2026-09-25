import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Nav } from './Nav';
import { Footer } from './Footer';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function Layout() {
  return (
    <div className="page">
      <ScrollToTop />
      <Nav />
      <main className="page__main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
