import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { PageHero } from '../components/site/PageHero';
import { SectionHead } from '../components/site/SectionHead';
import { easeOut } from '../lib/motion';

export function ChallengePage() {
  const reduce = useReducedMotion();
  const t = (d = 0.6) => ({ duration: reduce ? 0 : d, ease: easeOut });

  return (
    <>
      <PageHero
        kicker="The challenge"
        title="Online retail still asks shoppers to imagine."
        sub="Static photos and size charts were never built for styled goods. Vyro exists because confidence should not depend on guesswork."
      />

      <section className="block">
        <SectionHead
          kicker="Pain points"
          title="Three problems every retailer feels."
          sub="These are the gaps Vyro closes — without asking you to leave your current platform."
        />
        <div className="problem-grid">
          {[
            {
              title: 'Conversion drops at the PDP',
              body: 'When shoppers cannot visualize fit, they hesitate. Hesitation becomes abandonment — especially on mobile.',
            },
            {
              title: 'Returns destroy margin',
              body: 'Wrong scale, wrong style, wrong expectation. Each return costs logistics, inventory, and trust.',
            },
            {
              title: 'Platform switches are expensive',
              body: 'Many try-on vendors assume you will rebuild. Vyro assumes the opposite — your store stays yours.',
            },
          ].map((card, i) => (
            <motion.article
              className="card card--problem"
              key={card.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...t(), delay: reduce ? 0 : i * 0.08 }}
            >
              <span className="card__index">0{i + 1}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="block block--soft">
        <SectionHead
          kicker="What changes"
          title="When try-on is real, behavior shifts."
        />
        <div className="detail-grid">
          {[
            {
              title: 'Longer sessions',
              body: 'Shoppers explore more variants when they can see products on themselves instantly.',
            },
            {
              title: 'Higher intent',
              body: 'Try-on reduces the mental gap between browsing and buying — especially for gifts and premium items.',
            },
            {
              title: 'Fewer surprises',
              body: 'Better expectations upfront mean fewer disappointed deliveries and support tickets.',
            },
            {
              title: 'Stronger brand',
              body: 'A premium try-on moment signals innovation without a full storefront redesign.',
            },
          ].map((item, i) => (
            <motion.article
              className="card"
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...t(0.55), delay: reduce ? 0 : i * 0.06 }}
            >
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="finale__card finale__card--inline">
          <h2>See how Vyro answers this.</h2>
          <p>Explore the platform, live experience, and integration path.</p>
          <div className="hero__cta">
            <Link className="btn" to="/platform">
              View platform
            </Link>
            <Link className="btn btn--ghost" to="/experience">
              See experience
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
