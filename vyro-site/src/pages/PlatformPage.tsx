import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PageHero } from '../components/site/PageHero';
import { SectionHead } from '../components/site/SectionHead';
import { easeOut } from '../lib/motion';

const FEATURES = [
  {
    title: 'Real-time tracking',
    body: 'MediaPipe-powered face and hand landmarks keep overlays aligned as shoppers move.',
    points: ['Face tracking for glasses & necklaces', 'Hand tracking for rings', 'Wrist placement for watches'],
  },
  {
    title: 'Catalog-ready rendering',
    body: 'Product assets map to your SKUs so the try-on layer matches what you sell.',
    points: ['PNG / SVG product assets', 'Variant switching on PDP', 'Category-based experiences'],
  },
  {
    title: 'Merchant controls',
    body: 'Launch pilots on selected categories, then expand as performance proves out.',
    points: ['Pilot → rollout workflow', 'Usage visibility', 'Dedicated onboarding'],
  },
];

export function PlatformPage() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const t = (d = 0.6) => ({ duration: reduce ? 0 : d, ease: easeOut });

  useEffect(() => {
    const id = window.setInterval(() => setActive((v) => (v + 1) % FEATURES.length), 4500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <PageHero
        kicker="The platform"
        title="AI try-on infrastructure your store can actually adopt."
        sub="Tracking, rendering, and rollout tools designed for retailers — not research labs."
      />

      <section className="block">
        <div className="split">
          <div>
            <SectionHead
              kicker="Core capabilities"
              title="Three layers that power every session."
            />
            <div className="tablist" role="tablist">
              {FEATURES.map((f, i) => (
                <button
                  key={f.title}
                  type="button"
                  role="tab"
                  className={`tab ${active === i ? 'is-active' : ''}`}
                  aria-selected={active === i}
                  onClick={() => setActive(i)}
                >
                  {f.title}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                className="feature-panel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={t(0.4)}
              >
                <p>{FEATURES[active].body}</p>
                <ul>
                  {FEATURES[active].points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
          <motion.div
            className="split__media"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={t(0.75)}
          >
            <img src="/brand/hero.png" alt="Vyro platform dashboard" />
            <div className="media-badge">Live tracking + product configurator</div>
          </motion.div>
        </div>
      </section>

      <section className="block block--soft">
        <SectionHead
          kicker="Under the hood"
          title="Built for speed, stability, and scale."
          align="center"
        />
        <div className="detail-grid">
          {[
            { title: 'Browser-native', body: 'Runs in modern browsers with camera access — no app download required.' },
            { title: 'Parallel loading', body: 'Camera, models, and product assets initialize together for faster first frame.' },
            { title: 'Smoothing layer', body: 'Placement algorithms reduce jitter so overlays feel stable and premium.' },
            { title: 'Multi-category', body: 'One engine spans glasses, watches, jewelry, and accessories.' },
          ].map((item, i) => (
            <motion.article
              className="tile"
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...t(0.55), delay: reduce ? 0 : i * 0.06 }}
            >
              <div className="tile__glow" />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="finale__card finale__card--inline">
          <h2>See it from the shopper side.</h2>
          <p>Open the live demo or explore the full experience page.</p>
          <div className="hero__cta">
            <Link className="btn" to="/experience">
              View experience
            </Link>
            <Link className="btn btn--ghost" to="/integrate">
              How to integrate
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
