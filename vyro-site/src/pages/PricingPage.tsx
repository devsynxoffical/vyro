import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PageHero } from '../components/site/PageHero';
import { SectionHead } from '../components/site/SectionHead';
import { DEMO_URL, EMAIL } from '../lib/constants';
import { easeOut } from '../lib/motion';

export function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const t = (d = 0.6) => ({ duration: reduce ? 0 : d, ease: easeOut });

  const faqs = [
    {
      q: 'How is pricing structured?',
      a: 'Flexible monthly subscription plans sized to your catalog depth, traffic, and rollout stage.',
    },
    {
      q: 'Is there a long-term contract?',
      a: 'We offer month-to-month plans designed for pilots that can grow into full assortment rollouts.',
    },
    {
      q: 'What is included in onboarding?',
      a: 'Asset guidance, integration support, and hands-on help through your first live sessions.',
    },
    {
      q: 'Can we start with one category?',
      a: 'Yes. Most partners begin with a focused pilot — for example eyewear or jewelry — then expand.',
    },
  ];

  return (
    <>
      <PageHero
        kicker="Pricing"
        title="Clear commercial model. Serious support."
        sub="No opaque enterprise maze. Start with a subscription that matches your catalog and growth stage."
      />

      <section className="block">
        <div className="price-grid">
          <motion.article
            className="price-card"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={t()}
          >
            <span className="price-card__label">Starter pilot</span>
            <h3>Prove value on a focused catalog</h3>
            <ul>
              <li>1–2 product categories</li>
              <li>Integration & asset guidance</li>
              <li>Monthly subscription</li>
              <li>Email support + onboarding calls</li>
            </ul>
            <a className="btn btn--ghost" href={EMAIL}>
              Request quote
            </a>
          </motion.article>
          <motion.article
            className="price-card price-card--featured"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...t(), delay: reduce ? 0 : 0.1 }}
          >
            <span className="price-card__label">Growth</span>
            <h3>Scale across your full assortment</h3>
            <ul>
              <li>Multi-category rollout</li>
              <li>Priority onboarding</li>
              <li>Ongoing optimization</li>
              <li>Dedicated partner success</li>
            </ul>
            <a className="btn" href={EMAIL}>
              Book a walkthrough
            </a>
          </motion.article>
        </div>
      </section>

      <section className="block block--soft">
        <SectionHead
          kicker="About Vyro"
          title="An Omani AI startup built for regional retail."
        />
        <div className="about-layout">
          <p className="about-copy">
            Vyro helps retailers across Oman and the GCC make online shopping feel real.
            Our mission — See Beyond — is to put virtual try-on inside the stores merchants
            already operate.
          </p>
          <div className="about-stats">
            {[
              ['Oman → GCC', 'Founded in Oman, built for the region'],
              ['Retail-first', 'Designed for merchants, not labs'],
              ['Human support', 'Onboarding with real people'],
            ].map(([n, l], i) => (
              <motion.div
                className="about-stat"
                key={n}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...t(0.5), delay: reduce ? 0 : i * 0.08 }}
              >
                <strong>{n}</strong>
                <span>{l}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <SectionHead kicker="FAQ" title="Pricing questions, answered." />
        <div className="faq">
          {faqs.map((item, i) => {
            const open = openFaq === i;
            return (
              <motion.div
                className={`faq__item ${open ? 'is-open' : ''}`}
                key={item.q}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...t(0.5), delay: reduce ? 0 : i * 0.05 }}
              >
                <button type="button" onClick={() => setOpenFaq(open ? null : i)}>
                  <span>{item.q}</span>
                  <i aria-hidden />
                </button>
                <div style={{ maxHeight: open ? 200 : 0 }} className="faq__a">
                  <p>{item.a}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="finale">
        <motion.div
          className="finale__card"
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={t(0.75)}
        >
          <h2>Let&apos;s talk about your store.</h2>
          <p>Book a demo, request pricing, or try the live experience first.</p>
          <div className="hero__cta">
            <a className="btn" href={EMAIL}>
              Contact us
            </a>
            <a className="btn btn--ghost" href={DEMO_URL} target="_blank" rel="noreferrer">
              Live try-on
            </a>
          </div>
          <p className="finale__contact">
            <a href={EMAIL}>info@vyroes.tech</a>
          </p>
        </motion.div>
      </section>
    </>
  );
}
