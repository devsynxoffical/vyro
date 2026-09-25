import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from './Reveal';
import './HomeSections.css';

const DEMO_URL = 'http://vyro.devsynx.com/';

const TRUST = [
  'Online Stores',
  'Marketplaces',
  'Luxury Retail',
  'Custom E-commerce',
  'Enterprise',
];

const BENEFITS = [
  {
    title: 'Real-time camera try-on',
    desc: 'Shoppers open their camera in the browser and see products on themselves instantly.',
  },
  {
    title: 'Jewelry, eyewear & more',
    desc: 'One platform for categories where visualization drives conversion.',
  },
  {
    title: 'Integrates with your stack',
    desc: 'Works with existing stores and marketplaces — no rebuild required.',
  },
  {
    title: 'Mobile-first experience',
    desc: 'Designed for phones and desktops with smooth, stable tracking.',
  },
];

const STEPS = [
  { title: 'Choose product', desc: 'Pick from your live catalog.' },
  { title: 'Open camera', desc: 'Browser permission — no app.' },
  { title: 'Try instantly', desc: 'Tracking follows as they move.' },
  { title: 'Purchase', desc: 'Buy with confidence.' },
];

const TOURS = [
  {
    title: 'Live try-on demo',
    desc: 'Experience real-time ring and necklace tracking in your browser.',
    href: DEMO_URL,
    external: true,
    cta: 'Open Try On',
  },
  {
    title: 'Partner walkthrough',
    desc: 'Book a session to explore integration for your store or marketplace.',
    href: '/demo',
    external: false,
    cta: 'Book a Demo',
  },
];

const STATS = [
  { value: '94%', label: 'Higher conversion with AR / 3D experiences' },
  { value: '60%', label: 'Shoppers prefer retailers with try-on' },
  { value: '40%', label: 'Fewer returns on high-value try-on products' },
];

export function TrustBar() {
  return (
    <section className="trust">
      <div className="container trust__inner">
        <p>Trusted by teams building modern commerce experiences</p>
        <div className="trust__logos">
          {TRUST.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FeatureLight() {
  return (
    <section className="section section--light feature-row">
      <div className="container feature-row__grid">
        <Reveal>
          <p className="eyebrow">Who we are</p>
          <h2 className="heading">
            Bringing products to life, before the click of “buy.”
          </h2>
          <p className="lead">
            Vyro helps retailers deliver immersive virtual try-on. Customers see
            products on themselves before purchasing — creating a more confident
            shopping journey.
          </p>
          <ul className="check-list">
            <li>No app download required</li>
            <li>Realistic tracking that follows movement</li>
            <li>Switch products instantly to compare</li>
          </ul>
          <Link className="btn btn--outline-dark" to="/about">
            About Vyro
          </Link>
        </Reveal>
        <Reveal delay={0.1} className="feature-row__media">
          <img src="/brand/hero.png" alt="Vyro try-on preview" />
        </Reveal>
      </div>
    </section>
  );
}

export function FeatureDark() {
  return (
    <section className="section section--dark feature-row feature-row--dark">
      <div className="container feature-row__grid feature-row__grid--reverse">
        <Reveal className="feature-row__media feature-row__media--glow">
          <img src="/brand/hero.png" alt="Vyro tracking interface" />
        </Reveal>
        <Reveal delay={0.08}>
          <p className="eyebrow">Why it matters</p>
          <h2 className="heading">
            Customers hesitate to buy products they can’t visualize.
          </h2>
          <p className="lead">
            That uncertainty means lower confidence, lost sales, and a weaker
            shopping experience. Vyro turns hesitation into action.
          </p>
          <div className="mini-stats">
            {STATS.map((stat) => (
              <div key={stat.value}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <Link className="btn btn--primary" to="/why">
            See why Vyro
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function BenefitsPanel() {
  const [active, setActive] = useState(0);

  return (
    <section className="section section--soft">
      <div className="container benefits">
        <Reveal className="benefits__intro">
          <p className="eyebrow">Built for retailers</p>
          <h2 className="heading">Everything you need for confident try-on.</h2>
        </Reveal>

        <div className="benefits__grid">
          <Reveal className="benefits__list">
            {BENEFITS.map((item, i) => (
              <button
                key={item.title}
                type="button"
                className={`benefits__item ${active === i ? 'is-active' : ''}`}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
              >
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </button>
            ))}
          </Reveal>
          <Reveal delay={0.08} className="benefits__preview">
            <img src="/brand/hero.png" alt={BENEFITS[active].title} />
            <div className="benefits__caption">
              <strong>{BENEFITS[active].title}</strong>
              <span>{BENEFITS[active].desc}</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function ProductShowcase() {
  return (
    <section className="section section--light showcase">
      <div className="container">
        <Reveal className="showcase__intro">
          <p className="eyebrow">Experience Vyro</p>
          <h2 className="heading">Real-time try-on, right in the browser.</h2>
          <p className="lead">
            Hand tracking, necklace placement, and product switching — designed
            for fashion and lifestyle brands.
          </p>
        </Reveal>
        <Reveal delay={0.08} className="showcase__frame">
          <img src="/brand/hero.png" alt="Full Vyro product experience" />
        </Reveal>
      </div>
    </section>
  );
}

export function ProductTour() {
  return (
    <section className="section section--soft">
      <div className="container">
        <Reveal className="tour-head">
          <div>
            <p className="eyebrow">Take a product tour</p>
            <h2 className="heading">See it in action.</h2>
          </div>
        </Reveal>
        <div className="tour-grid">
          {TOURS.map((tour, i) => (
            <Reveal key={tour.title} delay={0.06 * i} className="tour-card">
              <div className="tour-card__media">
                <img src="/brand/hero.png" alt="" />
              </div>
              <div className="tour-card__body">
                <h3>{tour.title}</h3>
                <p>{tour.desc}</p>
                {tour.external ? (
                  <a className="btn btn--outline-dark" href={tour.href} target="_blank" rel="noreferrer">
                    {tour.cta}
                  </a>
                ) : (
                  <Link className="btn btn--outline-dark" to={tour.href}>
                    {tour.cta}
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Integrations() {
  return (
    <section className="section section--dark integrations-band">
      <div className="container integrations-band__grid">
        <Reveal className="integrations-band__icons" aria-hidden>
          {['Stores', 'Shopify*', 'Custom', 'Marketplaces', 'Luxury', 'Apps'].map((label) => (
            <span key={label}>{label}</span>
          ))}
          <div className="integrations-band__core">
            <img src="/brand/icon-dark.PNG" alt="" />
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="eyebrow">Works anywhere</p>
          <h2 className="heading">
            Works with existing stores &amp; marketplaces.
          </h2>
          <p className="lead">
            Integrate with online stores, multi-vendor marketplaces, and custom
            e-commerce websites. Vyro sits alongside your stack — not instead of
            it.
          </p>
          <Link className="btn btn--primary" to="/categories">
            View categories
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="section section--light">
      <div className="container">
        <Reveal className="showcase__intro">
          <p className="eyebrow">How it works</p>
          <h2 className="heading">From browsing to buying in four steps.</h2>
        </Reveal>
        <div className="steps-row">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={0.05 * i} className="steps-row__item">
              <span>{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Testimonial() {
  return (
    <section className="section section--soft testimonial">
      <div className="container testimonial__grid">
        <Reveal>
          <p className="eyebrow">Customer confidence</p>
          <blockquote>
            “Shoppers don’t just browse — they try. That’s the difference between
            hesitation and checkout.”
          </blockquote>
          <p className="testimonial__meta">Vyro · Virtual Try-On Platform</p>
        </Reveal>
        <Reveal delay={0.1} className="testimonial__media">
          <img src="/brand/hero.png" alt="" />
        </Reveal>
      </div>
    </section>
  );
}

export function CategoriesBand() {
  const items = [
    { title: 'Eyewear', desc: 'Live face try-on for frames' },
    { title: 'Jewelry', desc: 'Necklaces, rings & more' },
    { title: 'Watches', desc: 'Wrist-level realism' },
    { title: 'Accessories', desc: 'Fashion categories that convert' },
  ];

  return (
    <section className="section section--light">
      <div className="container">
        <Reveal className="tour-head">
          <div>
            <p className="eyebrow">Supported categories</p>
            <h2 className="heading">One platform, every try-on category.</h2>
          </div>
          <Link className="text-link" to="/categories">
            View all →
          </Link>
        </Reveal>
        <div className="cat-grid">
          {items.map((item, i) => (
            <Reveal key={item.title} delay={0.04 * i} className="cat-card">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FooterCta() {
  return (
    <section className="footer-cta">
      <div className="container footer-cta__inner">
        <Reveal>
          <h2>Ready to see beyond?</h2>
          <p>
            Try the live demo now, or book a walkthrough with our team.
          </p>
          <div className="footer-cta__actions">
            <a className="btn btn--dark" href={DEMO_URL} target="_blank" rel="noreferrer">
              Try On
            </a>
            <Link className="btn btn--primary" to="/demo">
              Book a Demo
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
