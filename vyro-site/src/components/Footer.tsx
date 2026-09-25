import { Link } from 'react-router-dom';
import './Footer.css';

const DEMO_URL = 'http://vyro.devsynx.com/';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <img src="/brand/vyro-logo.PNG" alt="Vyro" className="footer__logo" />
          <p>
            See Beyond. Virtual try-on for fashion &amp; lifestyle brands.
            Integrate with the stores and marketplaces you already run.
          </p>
          <div className="footer__social">
            <a href="mailto:hello@vyro.app" aria-label="Email">
              Email
            </a>
            <a
              href="https://instagram.com/vyro"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              Instagram
            </a>
            <a href={DEMO_URL} target="_blank" rel="noreferrer">
              Live Demo
            </a>
          </div>
        </div>

        <div className="footer__col">
          <h4>Product</h4>
          <Link to="/categories">Categories</Link>
          <a href={DEMO_URL} target="_blank" rel="noreferrer">
            Try On
          </a>
          <Link to="/why">Why Vyro</Link>
          <Link to="/demo">Book a Demo</Link>
        </div>

        <div className="footer__col">
          <h4>Company</h4>
          <Link to="/about">About</Link>
          <Link to="/demo">Contact</Link>
          <a href="mailto:hello@vyro.app">Partners</a>
        </div>

        <div className="footer__col">
          <h4>Support</h4>
          <a href="mailto:hello@vyro.app">hello@vyro.app</a>
          <Link to="/demo">Request demo</Link>
        </div>
      </div>

      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} Vyro. An Omanitechology Company.</span>
        <span>Leading virtual shopping across the Middle East and beyond.</span>
      </div>
    </footer>
  );
}
