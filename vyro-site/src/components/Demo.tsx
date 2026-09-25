import { FormEvent, useState } from 'react';
import { Reveal } from './Reveal';
import './Demo.css';

export function Demo() {
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
    <section className="section demo" id="demo">
      <div className="container demo__layout">
        <Reveal>
          <p className="section__label">Book a Demo</p>
          <h2 className="section__title">Let’s build the future together.</h2>
          <p className="section__lead">
            Whether you’re a retailer, marketplace, technology partner, or
            investor — we’d love to connect. See Vyro in action and explore how
            try-on fits your stack.
          </p>
          <ul className="demo__perks">
            <li>Live browser demo — no app install</li>
            <li>Discuss integration for your store or marketplace</li>
            <li>Vision for Middle East &amp; beyond</li>
          </ul>
          <a
            className="demo__try"
            href="https://vyro.devsynx.com/"
            target="_blank"
            rel="noreferrer"
          >
            Try the live demo →
          </a>
        </Reveal>

        <Reveal delay={0.1} className="demo__form-wrap">
          <form className="demo__form" onSubmit={onSubmit}>
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
                placeholder="Tell us about your store, categories, or partnership goals"
              />
            </label>
            <button className="btn btn--primary btn--full" type="submit">
              {sent ? 'Opening email…' : 'Request a Demo'}
            </button>
            <p className="demo__note">
              Prefer email?{' '}
              <a href="mailto:hello@vyro.app">hello@vyro.app</a>
            </p>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
