import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import './Page.css';

const STATS = [
  { value: '94%', label: 'Higher conversion with AR / 3D product experiences' },
  { value: '60%', label: 'Of shoppers prefer retailers offering virtual try-on' },
  { value: '40%', label: 'Fewer returns on high-value try-on products' },
];

const STEPS = [
  { title: 'Choose product', desc: 'Pick from your live catalog.' },
  { title: 'Open camera', desc: 'Browser permission — no app download.' },
  { title: 'Try instantly', desc: 'Tracking that follows as they move.' },
  { title: 'Purchase', desc: 'Buy with confidence, fewer returns.' },
];

const POINTS = [
  'A better, more confident shopping experience',
  'Fast, easy integration for retailers',
  'Mobile-first experience',
  'Faster purchase decisions',
  'Scalable, modern technology platform',
  'Enterprise ready',
];

export function WhyPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow">Why Vyro</p>
          <h1>Built for retailers. Designed for customers.</h1>
          <p>
            Customers hesitate when they can’t visualize a product. Vyro turns
            that hesitation into confident purchases.
          </p>
        </div>
      </header>

      <section className="section section--light">
        <div className="container">
          <Reveal>
            <p className="eyebrow">Why virtual try-on matters</p>
            <h2 className="heading">Uncertainty costs sales.</h2>
            <p className="lead">
              Lower purchase confidence, lost conversions, and a less engaging
              shopping experience — try-on fixes the gap between browsing and
              buying.
            </p>
          </Reveal>
          <div className="stat-grid">
            {STATS.map((stat, i) => (
              <Reveal key={stat.value} delay={0.05 * i} className="stat-card">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2 className="heading">From browsing to buying in four steps.</h2>
          </Reveal>
          <div className="step-grid">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={0.05 * i} className="step-card">
                <span>{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container">
          <Reveal>
            <p className="eyebrow">Why teams choose Vyro</p>
            <h2 className="heading">Everything you need to ship try-on.</h2>
          </Reveal>
          <div className="point-grid">
            {POINTS.map((point, i) => (
              <Reveal key={point} delay={0.04 * i} className="point-card">
                {point}
              </Reveal>
            ))}
          </div>
          <Reveal className="page-actions page-actions--dark">
            <a
              className="btn btn--primary"
              href="http://vyro.devsynx.com/"
              target="_blank"
              rel="noreferrer"
            >
              Try On
            </a>
            <Link className="btn btn--ghost" to="/demo">
              Book a Demo
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
