import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import './Page.css';

export function AboutPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow">About Vyro</p>
          <h1>Bringing products to life, before the click of “buy.”</h1>
          <p>
            Vyro is a virtual try-on solution for e-commerce. We integrate with
            existing online stores, multi-vendor marketplaces, and custom
            websites — we don’t build stores from scratch.
          </p>
        </div>
      </header>

      <section className="section section--light">
        <div className="container page-prose">
          <Reveal>
            <h2>Our story</h2>
            <p>
              Customers hesitate to buy products they can’t visualize. That
              uncertainty leads to lower purchase confidence, lost sales, and a
              less engaging online experience.
            </p>
            <p>
              Vyro lets shoppers instantly try products using their device
              camera — simple, realistic, and seamless. Real-time tracking
              follows them as they move. Switching products is instant. No app
              download required.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2>Our vision</h2>
            <p>
              To become the leading virtual shopping platform across the Middle
              East and beyond — helping retailers and marketplaces deliver
              confident, modern shopping experiences.
            </p>
            <div className="page-actions">
              <Link className="btn btn--outline-dark" to="/demo">
                Book a Demo
              </Link>
              <Link className="btn btn--dark" to="/why">
                Why Vyro
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
