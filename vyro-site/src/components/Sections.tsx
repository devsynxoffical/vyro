import { Reveal } from './Reveal';
import './Sections.css';

export function About() {
  return (
    <section className="section about" id="about">
      <div className="container about__grid">
        <Reveal>
          <p className="section__label">Who We Are</p>
          <h2 className="section__title">
            Bringing products to life, before the click of “buy.”
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="section__lead about__copy">
            Vyro helps retailers bring products to life through immersive
            virtual try-on experiences. Customers see products on themselves
            before purchasing — creating a more confident, engaging shopping
            journey. We don’t build online stores. We integrate seamlessly with
            the ones you already have.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

const CATEGORIES = [
  {
    title: 'Virtual Eyewear',
    desc: 'Frames that sit true on the face — live camera try-on.',
    icon: '◎',
  },
  {
    title: 'Jewelry',
    desc: 'Necklaces, rings & more that track naturally on body.',
    icon: '◇',
  },
  {
    title: 'Watches',
    desc: 'Wrist-level realism for luxury and everyday timepieces.',
    icon: '◷',
  },
  {
    title: 'Fashion & Accessories',
    desc: 'Scalable try-on for categories that benefit from fit.',
    icon: '✦',
  },
];

export function Categories() {
  return (
    <section className="section categories" id="categories">
      <div className="container">
        <Reveal>
          <p className="section__label">What We Offer</p>
          <h2 className="section__title">One platform, every category that benefits from try-on.</h2>
          <p className="section__lead">
            Built for luxury retail, e-commerce, and enterprise teams who want
            try-on without rebuilding their stack.
          </p>
        </Reveal>

        <div className="category-grid">
          {CATEGORIES.map((item, i) => (
            <Reveal key={item.title} delay={0.06 * i} className="category">
              <span className="category__icon" aria-hidden>
                {item.icon}
              </span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const WHY = [
  {
    title: 'A better, more confident shopping experience',
    desc: 'Shoppers decide faster when they can see products on themselves.',
  },
  {
    title: 'Fast, easy integration for retailers',
    desc: 'Drop into existing stores — no rebuild, no native app required.',
  },
  {
    title: 'Mobile-first experience',
    desc: 'Real-time try-on in the browser, optimized for phones and desktops.',
  },
  {
    title: 'Scalable, enterprise-ready platform',
    desc: 'Modern architecture designed to grow with catalogs and traffic.',
  },
];

export function WhyVyro() {
  return (
    <section className="section why" id="why">
      <div className="container">
        <Reveal>
          <p className="section__label">Why Vyro</p>
          <h2 className="section__title">
            Built for retailers. Designed for customers.
          </h2>
        </Reveal>

        <div className="why__list">
          {WHY.map((item, i) => (
            <Reveal key={item.title} delay={0.05 * i} className="why__item">
              <span className="why__index">0{i + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
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
    <section className="section integrations" id="integrations">
      <div className="container integrations__panel">
        <Reveal>
          <p className="section__label">Works Anywhere</p>
          <h2 className="section__title integrations__title">
            Works with existing stores &amp; marketplaces.
          </h2>
          <p className="section__lead">
            Integrate with online stores, multi-vendor marketplaces, and custom
            e-commerce websites. Vyro sits alongside your stack — not instead of
            it.
          </p>
        </Reveal>

        <Reveal delay={0.12} className="integrations__chips">
          {['Online Stores', 'Multi-vendor Marketplaces', 'Custom E-commerce', 'Luxury Retail'].map(
            (label) => (
              <span key={label} className="chip">
                {label}
              </span>
            ),
          )}
        </Reveal>
      </div>
    </section>
  );
}

const STATS = [
  { value: '94%', label: 'higher conversion with AR / 3D product experiences' },
  { value: '60%', label: 'of shoppers prefer retailers offering virtual try-on' },
  { value: '40%', label: 'fewer returns on high-value try-on products' },
];

const STEPS = [
  { title: 'Choose Product', desc: 'Pick from your live catalog.' },
  { title: 'Open Camera', desc: 'Browser permission — no app download.' },
  { title: 'Try Instantly', desc: 'Tracking that follows as they move.' },
  { title: 'Purchase', desc: 'Buy with confidence, fewer returns.' },
];

export function Matters() {
  return (
    <section className="section matters" id="matters">
      <div className="container">
        <Reveal>
          <p className="section__label">Why Virtual Try-On Matters</p>
          <h2 className="section__title">
            Customers hesitate to buy products they can’t visualize.
          </h2>
          <p className="section__lead">
            Uncertainty means lower purchase confidence, lost sales, and a less
            engaging online experience. Vyro turns hesitation into action.
          </p>
        </Reveal>

        <div className="stats">
          {STATS.map((stat, i) => (
            <Reveal key={stat.value} delay={0.08 * i} className="stat">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </Reveal>
          ))}
        </div>

        <Reveal className="steps-wrap">
          <h3 className="steps__heading">From browsing to buying, in four steps.</h3>
          <div className="steps">
            {STEPS.map((step, i) => (
              <div key={step.title} className="step">
                <span className="step__num">{i + 1}</span>
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
