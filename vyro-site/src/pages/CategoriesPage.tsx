import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import './Page.css';

const CATEGORIES = [
  {
    title: 'Virtual Eyewear',
    desc: 'Let shoppers try frames on their face in real time — accurate placement, natural movement.',
  },
  {
    title: 'Jewelry',
    desc: 'Necklaces, rings, earrings and more with body-aware tracking for a premium try-on feel.',
  },
  {
    title: 'Watches',
    desc: 'Wrist-level realism that helps customers compare styles before they buy.',
  },
  {
    title: 'Fashion & Accessories',
    desc: 'Extend try-on to the categories where visualization drives conversion.',
  },
  {
    title: 'Enterprise Solutions',
    desc: 'Built for luxury retail and large catalogs with scalable technology.',
  },
  {
    title: 'E-commerce & Marketplaces',
    desc: 'Works with existing storefronts and multi-vendor platforms without a rebuild.',
  },
];

export function CategoriesPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow">Supported categories</p>
          <h1>One platform, every category that benefits from try-on.</h1>
          <p>
            From eyewear to jewelry and beyond — Vyro is designed for retailers
            who want immersive try-on without rebuilding their stack.
          </p>
        </div>
      </header>

      <section className="section section--soft">
        <div className="container">
          <div className="page-cards">
            {CATEGORIES.map((item, i) => (
              <Reveal key={item.title} delay={0.04 * i} className="page-card">
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="page-actions">
            <a
              className="btn btn--outline-dark"
              href="http://vyro.devsynx.com/"
              target="_blank"
              rel="noreferrer"
            >
              Try On
            </a>
            <Link className="btn btn--dark" to="/demo">
              Book a Demo
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
