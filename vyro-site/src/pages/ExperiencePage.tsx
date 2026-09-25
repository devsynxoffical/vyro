import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { PageHero } from '../components/site/PageHero';
import { SectionHead } from '../components/site/SectionHead';
import { VideoDemoCard } from '../components/site/VideoDemoCard';
import { DEMO_URL } from '../lib/constants';
import { easeOut } from '../lib/motion';

export function ExperiencePage() {
  const reduce = useReducedMotion();
  const t = (d = 0.6) => ({ duration: reduce ? 0 : d, ease: easeOut });

  return (
    <>
      <PageHero
        kicker="Live experience"
        title="What shoppers actually see and feel."
        sub="Camera try-on that runs inside your store — fast, visual, and built for mobile-first shopping."
      />

      <section className="block">
        <SectionHead
          kicker="Interactive demo"
          title="Click play to open the live try-on."
          sub="Your dashboard preview is the thumbnail. The play button opens the full demo at vyro.devsynx.com."
        />
        <VideoDemoCard />
        <div className="shot-row">
          <motion.figure
            className="shot"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={t()}
          >
            <img src="/brand/tryon-ring.jpg" alt="Ring try-on detail" />
            <figcaption>Ring placement with hand tracking</figcaption>
          </motion.figure>
          <motion.figure
            className="shot"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...t(), delay: reduce ? 0 : 0.1 }}
          >
            <img src="/brand/tryon-mobile.webp" alt="Mobile try-on" />
            <figcaption>Optimized for phone cameras</figcaption>
          </motion.figure>
        </div>
      </section>

      <section className="block block--soft">
        <SectionHead
          kicker="Categories"
          title="Four ways shoppers can try before they buy."
          align="center"
        />
        <div className="cat-grid">
          {[
            {
              title: 'Glasses',
              body: 'Frames align to the face in real time — style decisions become immediate.',
              tag: 'Face tracking',
            },
            {
              title: 'Watches',
              body: 'Case and strap scale on the wrist for confident comparisons.',
              tag: 'Wrist tracking',
            },
            {
              title: 'Jewelry',
              body: 'Necklaces and rings track naturally as customers move.',
              tag: 'Face + hand',
            },
            {
              title: 'Accessories',
              body: 'Extend the same engine to fashion add-ons in your catalog.',
              tag: 'Expandable',
            },
          ].map((c, i) => (
            <motion.article
              className="tile"
              key={c.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...t(0.55), delay: reduce ? 0 : i * 0.07 }}
              whileHover={reduce ? undefined : { y: -8 }}
            >
              <div className="tile__glow" />
              <span className="tile__tag">{c.tag}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="block">
        <SectionHead
          kicker="Session flow"
          title="From product page to mirror moment."
        />
        <ol className="steps-list steps-list--page">
          {[
            {
              title: 'Shopper lands on PDP',
              body: 'They tap Try On from your existing product page — no separate app.',
            },
            {
              title: 'Camera permission',
              body: 'Browser requests access. HTTPS required for secure camera use.',
            },
            {
              title: 'Live overlay',
              body: 'Product renders on face, hand, or wrist with real-time tracking.',
            },
            {
              title: 'Switch & compare',
              body: 'Change variants or categories without leaving the session.',
            },
            {
              title: 'Buy with confidence',
              body: 'Return to checkout on your store with a clearer purchase decision.',
            },
          ].map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ ...t(0.5), delay: reduce ? 0 : i * 0.06 }}
            >
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="block">
        <div className="finale__card finale__card--inline">
          <h2>Try it yourself right now.</h2>
          <p>The fastest way to understand Vyro is to use it.</p>
          <div className="hero__cta">
            <a className="btn" href={DEMO_URL} target="_blank" rel="noreferrer">
              Open live demo
            </a>
            <Link className="btn btn--ghost" to="/integrate">
              Add to my store
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
