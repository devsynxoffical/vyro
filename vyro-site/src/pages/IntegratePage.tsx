import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { PageHero } from '../components/site/PageHero';
import { SectionHead } from '../components/site/SectionHead';
import { EMAIL } from '../lib/constants';
import { easeOut } from '../lib/motion';

export function IntegratePage() {
  const reduce = useReducedMotion();
  const t = (d = 0.6) => ({ duration: reduce ? 0 : d, ease: easeOut });

  return (
    <>
      <PageHero
        kicker="Integration"
        title="We meet your website where it already is."
        sub="Vyro’s core promise: enhance the store you run today. No forced migration. No rebuild from scratch."
      />

      <section className="block">
        <div className="integrate-grid">
          <motion.div
            className="card card--wide"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={t()}
          >
            <SectionHead
              kicker="Process"
              title="Three steps to go live."
            />
            <ol className="steps-list">
              {[
                {
                  title: 'Discovery & scoping',
                  body: 'We learn your catalog, categories, and storefront stack. Together we pick a pilot scope.',
                },
                {
                  title: 'Embed & configure',
                  body: 'Vyro is added to product pages or a try-on entry point. Assets and SKUs are mapped.',
                },
                {
                  title: 'Launch with support',
                  body: 'We stay close through go-live — tracking quality, UX placement, and rollout expansion.',
                },
              ].map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </li>
              ))}
            </ol>
          </motion.div>
          <div className="stack-cards">
            {[
              {
                title: 'Works with existing stacks',
                body: 'Custom builds, Shopify-style stores, and marketplaces — we integrate, not replace.',
              },
              {
                title: 'Typical pilot: under 2 weeks',
                body: 'Focused launches move fast once product assets and page placement are agreed.',
              },
              {
                title: 'Human onboarding',
                body: 'Dedicated support through setup, QA, and first customer sessions.',
              },
            ].map((c, i) => (
              <motion.article
                className="card"
                key={c.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...t(0.55), delay: reduce ? 0 : i * 0.08 }}
              >
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="block block--soft">
        <SectionHead
          kicker="What you keep"
          title="Your brand, checkout, and operations stay intact."
          align="center"
        />
        <div className="detail-grid">
          {[
            { title: 'Your design system', body: 'Fonts, colors, and page layout remain yours. Try-on is an enhancement layer.' },
            { title: 'Your checkout flow', body: 'Purchases still happen on your store — we do not become a new storefront.' },
            { title: 'Your catalog ownership', body: 'You control which products launch with try-on and when to expand.' },
            { title: 'Your customer data path', body: 'Sessions stay within your shopper journey and analytics context.' },
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
        <div className="marquee">
          <div className="marquee__track">
            {[
              'Eyewear boutiques',
              'Watch retailers',
              'Jewelry brands',
              'Fashion accessories',
              'D2C stores',
              'Online marketplaces',
              'Regional chains',
              'Omnichannel retailers',
            ]
              .concat([
                'Eyewear boutiques',
                'Watch retailers',
                'Jewelry brands',
                'Fashion accessories',
                'D2C stores',
                'Online marketplaces',
                'Regional chains',
                'Omnichannel retailers',
              ])
              .map((label, i) => (
                <span className="chip" key={`${label}-${i}`}>
                  {label}
                </span>
              ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="finale__card finale__card--inline">
          <h2>Ready to scope your integration?</h2>
          <p>Tell us about your catalog and we will map the fastest path to live.</p>
          <div className="hero__cta">
            <a className="btn" href={EMAIL}>
              Book a walkthrough
            </a>
            <Link className="btn btn--ghost" to="/pricing">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
