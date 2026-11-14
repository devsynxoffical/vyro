import type { ReactNode } from 'react';

/** Split sign-in layout: an ink brand panel on wide screens, the form alone on phones. */
export function AuthLayout({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="vy vy-auth">
      <aside className="vy-auth__brand" aria-hidden>
        <strong className="vy-brandmark" style={{ alignSelf: 'flex-start' }}>VYRO</strong>
        <div>
          <h2>Try-on that sells, run from one place.</h2>
          <p>Your subscription, invoices, products and website widget in a single console.</p>
        </div>
        <small>Payments are processed securely by OMPAY.</small>
      </aside>
      <main className="vy-auth__main">
        <div className={`vy-auth__form ${wide ? 'vy-auth__form--wide' : ''}`}>
          <div className="vy-auth__mark vy-brandmark" style={{ justifySelf: 'start' }}>VYRO</div>
          {children}
        </div>
      </main>
    </div>
  );
}
