import { useState, type FormEvent } from 'react';
import { Reveal } from '../components/Reveal';
import './Page.css';

const DEMO_URL = 'http://vyro.devsynx.com/';

export function DemoPage() {
  const [sent, setSent] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const company = String(data.get('company') || '').trim();
    const message = String(data.get('message') || '').trim();

    const subject = encodeURIComponent(`Vyro demo request — ${company || name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nCompany: ${company}\n\n${message}`,
    );

    window.location.href = `mailto:hello@vyro.app?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <>
      <header className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow">Book a demo</p>
          <h1>Let’s build the future together.</h1>
          <p>
            Whether you’re a retailer, marketplace, technology partner, or
            investor — we’d love to connect.
          </p>
        </div>
      </header>

      <section className="section section--soft">
        <div className="container demo-layout">
          <Reveal>
            <h2 className="heading">See Vyro in action</h2>
            <p className="lead">
              Prefer to explore first? Open the live try-on demo in your
              browser — no install required.
            </p>
            <ul className="demo-list">
              <li>Live browser demo</li>
              <li>Discuss integration for your store or marketplace</li>
              <li>Vision for Middle East &amp; beyond</li>
            </ul>
            <a className="btn btn--outline-dark" href={DEMO_URL} target="_blank" rel="noreferrer">
              Open Try On Demo
            </a>
          </Reveal>

          <Reveal delay={0.08} className="demo-form-card">
            <form onSubmit={onSubmit}>
              <label>
                <span>Name</span>
                <input name="name" required placeholder="Your name" autoComplete="name" />
              </label>
              <label>
                <span>Work email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </label>
              <label>
                <span>Company</span>
                <input name="company" placeholder="Brand or marketplace" autoComplete="organization" />
              </label>
              <label>
                <span>Message</span>
                <textarea
                  name="message"
                  rows={4}
                  placeholder="Tell us about your store, categories, or goals"
                />
              </label>
              <button className="btn btn--primary btn--full" type="submit">
                {sent ? 'Opening email…' : 'Request a Demo'}
              </button>
              <p className="demo-note">
                Or email us at <a href="mailto:hello@vyro.app">hello@vyro.app</a>
              </p>
            </form>
          </Reveal>
        </div>
      </section>
    </>
  );
}
