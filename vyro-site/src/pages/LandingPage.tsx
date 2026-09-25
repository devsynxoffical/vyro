import { useEffect, useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import './Landing.css';

const DEMO_URL = 'http://vyro.devsynx.com/';
const EMAIL = 'mailto:hello@vyro.om';

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

function SectionHead({
  kicker,
  title,
  sub,
  align = 'left',
}: {
  kicker: string;
  title: string;
  sub?: string;
  align?: 'left' | 'center';
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`section-head ${align === 'center' ? 'section-head--center' : ''}`}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.35 }}
    >
      <motion.span
        className="kicker"
        variants={fadeUp}
        transition={{ duration: reduce ? 0 : 0.55 }}
      >
        {kicker}
      </motion.span>
      <motion.h2
        className="section-title"
        variants={fadeUp}
        transition={{ duration: reduce ? 0 : 0.65 }}
      >
        {title}
      </motion.h2>
      {sub ? (
        <motion.p
          className="section-sub"
          variants={fadeUp}
          transition={{ duration: reduce ? 0 : 0.65 }}
        >
          {sub}
        </motion.p>
      ) : null}
    </motion.div>
  );
}

export function LandingPage() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100;
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.width = `${pct}%`;
      setNavScrolled(window.scrollY > 32);
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => document.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveFeature((v) => (v + 1) % 3);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const glow = document.getElementById('cursorGlow');
    const dot = document.getElementById('cursorDot');
    if (!glow || !dot || reduce) return;

    let mx = innerWidth / 2;
    let my = innerHeight / 2;
    let gx = mx;
    let gy = my;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    };
    const tick = () => {
      gx += (mx - gx) * 0.09;
      gy += (my - gy) * 0.09;
      glow.style.transform = `translate(${gx}px, ${gy}px)`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('mousemove', onMove);

    const enlarge = () => {
      dot.style.width = '26px';
      dot.style.height = '26px';
    };
    const shrink = () => {
      dot.style.width = '8px';
      dot.style.height = '8px';
    };
    document.querySelectorAll('a, button, .card, .tile, .play-hit').forEach((el) => {
      el.addEventListener('mouseenter', enlarge);
      el.addEventListener('mouseleave', shrink);
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, [reduce]);

  const t = (d = 0.65) => ({
    duration: reduce ? 0 : d,
    ease: [0.16, 1, 0.3, 1] as const,
  });

  const closeMenu = () => setMenuOpen(false);

  const features = [
    {
      title: 'Real-time body tracking',
      body: 'Face, hand, and wrist landmarks keep every overlay locked to the shopper — frames, straps, chains, and rings included.',
      points: ['Glasses & eyewear', 'Watches on the wrist', 'Necklaces & rings'],
    },
    {
      title: 'Installs on your store',
      body: 'Vyro drops into the catalog and PDP you already run. No new storefront. No painful migration.',
      points: ['Snippet or SDK', 'Catalog sync support', 'Typical live in under 2 weeks'],
    },
    {
      title: 'Built for conversion',
      body: 'Shoppers stop guessing. Retailers see fewer size/fit returns and stronger add-to-cart confidence.',
      points: ['Higher intent checkouts', 'Lower return friction', 'Works on mobile & desktop'],
    },
  ];

  const faqs = [
    {
      q: 'Will I need a new website?',
      a: 'No. Vyro is designed to sit on top of your current e-commerce stack — Shopify, custom builds, marketplaces, and more.',
    },
    {
      q: 'What categories can I launch with?',
      a: 'Glasses, watches, jewelry, and fashion accessories. More categories are on the roadmap as we expand with partners.',
    },
    {
      q: 'How long does integration take?',
      a: 'Most pilots go live within two weeks once assets and product mapping are ready. We handle onboarding with your team.',
    },
    {
      q: 'Is there a big upfront fee?',
      a: 'Pricing is a flexible monthly subscription sized to your catalog and traffic — no heavy platform lock-in.',
    },
    {
      q: 'Can shoppers try products on their phone?',
      a: 'Yes. The live try-on experience is built for mobile cameras first, with desktop support as well.',
    },
  ];

  return (
    <div className="landing">
      <div className="progress-bar" id="progressBar" />
      <div className="cursor-glow" id="cursorGlow" />
      <div className="cursor-dot" id="cursorDot" />
      <div className="ambiance" aria-hidden>
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
        <span className="noise" />
      </div>

      {/* NAV */}
      <header className={`topnav ${navScrolled ? 'is-solid' : ''}`}>
        <a className="brand" href="#top" onClick={closeMenu}>
          <img src="/brand/icon-dark.PNG" alt="" />
          <span>VYRO</span>
        </a>
        <nav className="topnav__links" aria-label="Primary">
          <a href="#problem">Challenge</a>
          <a href="#platform">Platform</a>
          <a href="#experience">Experience</a>
          <a href="#integrate">Integrate</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="topnav__actions">
          <a className="link-quiet" href={DEMO_URL} target="_blank" rel="noreferrer">
            Live demo
          </a>
          <a className="btn btn--sm" href="#contact">
            Talk to us
          </a>
          <button
            type="button"
            className={`burger ${menuOpen ? 'is-open' : ''}`}
            aria-label="Open menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <i />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="drawer"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {[
              ['#problem', 'Challenge'],
              ['#platform', 'Platform'],
              ['#experience', 'Experience'],
              ['#integrate', 'Integrate'],
              ['#pricing', 'Pricing'],
              ['#contact', 'Contact'],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={closeMenu}>
                {label}
              </a>
            ))}
            <a className="btn" href={DEMO_URL} target="_blank" rel="noreferrer" onClick={closeMenu}>
              Open live try-on
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main id="top">
        {/* HERO */}
        <section className="hero">
          <div className="hero__copy">
            <motion.p
              className="pill"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t(0.6)}
            >
              <span className="pill__dot" />
              AI try-on for modern retail
            </motion.p>
            <h1 className="hero__title">
              <motion.span
                initial={{ opacity: 0, y: 36 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...t(0.75), delay: reduce ? 0 : 0.05 }}
              >
                Your store stays yours.
              </motion.span>
              <motion.span
                className="hero__title-grad"
                initial={{ opacity: 0, y: 36 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...t(0.75), delay: reduce ? 0 : 0.15 }}
              >
                Try-on becomes instant.
              </motion.span>
            </h1>
            <motion.p
              className="hero__lede"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t(0.7), delay: reduce ? 0 : 0.25 }}
            >
              Vyro embeds realistic virtual try-on into the e-commerce website retailers
              already use — so shoppers can see glasses, watches, jewelry, and accessories
              on themselves before they buy.
            </motion.p>
            <motion.div
              className="hero__cta"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t(0.7), delay: reduce ? 0 : 0.35 }}
            >
              <a className="btn" href={DEMO_URL} target="_blank" rel="noreferrer">
                Launch live try-on
              </a>
              <a className="btn btn--ghost" href="#experience">
                See how it looks
              </a>
            </motion.div>
            <motion.ul
              className="hero__proof"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...t(0.7), delay: reduce ? 0 : 0.45 }}
            >
              <li>No website rebuild</li>
              <li>Monthly subscription</li>
              <li>Omani startup → GCC</li>
            </motion.ul>
          </div>

          <motion.div
            className="hero__visual"
            initial={{ opacity: 0, scale: 0.94, x: 24 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ ...t(0.9), delay: reduce ? 0 : 0.2 }}
          >
            <div className="hero-frame">
              <img src="/brand/hero.png" alt="Vyro AI virtual try-on dashboard" />
              <div className="hero-frame__glow" />
              <div className="hero-float hero-float--a">
                <span className="live" /> Live tracking
              </div>
              <div className="hero-float hero-float--b">Embeds in your store</div>
            </div>
          </motion.div>
        </section>

        {/* LOGO / TRUST STRIP */}
        <section className="trust">
          <p>Trusted vision for</p>
          <div className="trust__row">
            {['Eyewear', 'Watches', 'Jewelry', 'Accessories', 'E-commerce', 'Marketplaces'].map(
              (label) => (
                <span key={label}>{label}</span>
              ),
            )}
          </div>
        </section>

        {/* PROBLEM */}
        <section className="block" id="problem">
          <SectionHead
            kicker="The challenge"
            title="Online shopping still asks people to guess."
            sub="Photos and size charts cannot replace seeing a product on your face, wrist, or neck — especially for styled goods."
          />
          <div className="problem-grid">
            {[
              {
                title: 'Guesswork kills conversion',
                body: 'Shoppers abandon carts when they cannot picture fit, scale, or style on themselves.',
              },
              {
                title: 'Returns eat margin',
                body: 'Wrong size, wrong look, wrong expectation — each return is costly and brand-damaging.',
              },
              {
                title: 'Switching platforms is painful',
                body: 'Retailers should not rebuild their entire store just to offer modern try-on.',
              },
            ].map((card, i) => (
              <motion.article
                className="card card--problem"
                key={card.title}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...t(0.6), delay: reduce ? 0 : i * 0.08 }}
              >
                <span className="card__index">0{i + 1}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        {/* PLATFORM / FEATURES */}
        <section className="block block--soft" id="platform">
          <div className="split">
            <div>
              <SectionHead
                kicker="The platform"
                title="Virtual try-on that feels native to your brand."
                sub="Pick a lane — tracking depth, store integration, or conversion outcomes — and explore how Vyro is built."
              />
              <div className="tablist" role="tablist">
                {features.map((f, i) => (
                  <button
                    key={f.title}
                    type="button"
                    role="tab"
                    className={`tab ${activeFeature === i ? 'is-active' : ''}`}
                    aria-selected={activeFeature === i}
                    onClick={() => setActiveFeature(i)}
                  >
                    {f.title}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature}
                  className="feature-panel"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={t(0.4)}
                >
                  <p>{features[activeFeature].body}</p>
                  <ul>
                    {features[activeFeature].points.map((p) => (
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
              <img src="/brand/tryon-mobile.webp" alt="Mobile virtual try-on preview" />
              <div className="media-badge">Mobile-first camera try-on</div>
            </motion.div>
          </div>
        </section>

        {/* CATEGORIES */}
        <section className="block" id="categories">
          <SectionHead
            kicker="Product coverage"
            title="Four categories. One consistent experience."
            sub="Expand beyond a single accessory type — show shoppers what matters for your catalog."
            align="center"
          />
          <div className="cat-grid">
            {[
              {
                title: 'Glasses',
                body: 'Frames scale to the face in real time so style decisions feel certain.',
                tag: 'Face tracking',
              },
              {
                title: 'Watches',
                body: 'Case and strap sit on the wrist — compare finishes before checkout.',
                tag: 'Wrist tracking',
              },
              {
                title: 'Jewelry',
                body: 'Necklaces and rings track naturally as customers move and turn.',
                tag: 'Face + hand',
              },
              {
                title: 'Accessories',
                body: 'Extend the same engine to fashion add-ons your shoppers love.',
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

        {/* EXPERIENCE / VIDEO THUMBNAIL */}
        <section className="block block--soft" id="experience">
          <SectionHead
            kicker="Live experience"
            title="Watch the product, not a pitch deck."
            sub="This is the Vyro try-on interface. Click play to open the live demo — camera try-on in your browser."
          />
          <motion.a
            className="video-card play-hit"
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={t(0.8)}
            whileHover={reduce ? undefined : { scale: 1.01 }}
          >
            <img
              className="video-card__thumb"
              src="/brand/hero.png"
              alt="Vyro try-on interface preview"
            />
            <div className="video-card__veil" />
            <div className="video-card__scan" />
            <div className="video-card__play" aria-hidden>
              <span />
            </div>
            <div className="video-card__meta">
              <strong>Open interactive demo</strong>
              <span>Redirects to vyro.devsynx.com · Camera permission required</span>
            </div>
          </motion.a>
          <div className="shot-row">
            <motion.figure
              className="shot"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={t(0.6)}
            >
              <img src="/brand/tryon-ring.jpg" alt="Ring try-on detail" />
              <figcaption>Ring placement with hand tracking</figcaption>
            </motion.figure>
            <motion.figure
              className="shot"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...t(0.6), delay: reduce ? 0 : 0.1 }}
            >
              <img src="/brand/tryon-mobile.webp" alt="Mobile try-on" />
              <figcaption>Designed for the phone in your pocket</figcaption>
            </motion.figure>
          </div>
        </section>

        {/* METRICS */}
        <section className="metrics">
          <div className="metrics__inner">
            {[
              { n: '94%', l: 'Potential conversion lift with AR try-on*' },
              { n: '40%', l: 'Fewer returns reported in try-on programs*' },
              { n: '<2 wks', l: 'Typical time from kickoff to pilot live' },
              { n: '4', l: 'Launch categories across style retail' },
            ].map((m, i) => (
              <motion.div
                key={m.l}
                className="metric"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...t(0.55), delay: reduce ? 0 : i * 0.07 }}
              >
                <strong>{m.n}</strong>
                <span>{m.l}</span>
              </motion.div>
            ))}
          </div>
          <p className="metrics__note">*Industry benchmarks for AR try-on; results vary by category and traffic.</p>
        </section>

        {/* INTEGRATION */}
        <section className="block" id="integrate">
          <SectionHead
            kicker="Integration"
            title="We meet your website where it already is."
            sub="Vyro’s biggest strength: enhance the store you run today. No forced platform switch."
          />
          <div className="integrate-grid">
            <motion.div
              className="card card--wide"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={t(0.65)}
            >
              <h3>How the connection works</h3>
              <ol className="steps-list">
                <li>
                  <strong>Map your catalog</strong>
                  <span>Choose products and categories for try-on — glasses, watches, jewelry, or accessories.</span>
                </li>
                <li>
                  <strong>Drop in the experience</strong>
                  <span>Add Vyro to product pages or a dedicated try-on entry — we guide implementation.</span>
                </li>
                <li>
                  <strong>Go live with support</strong>
                  <span>Dedicated onboarding keeps tracking quality and merchandising aligned.</span>
                </li>
              </ol>
            </motion.div>
            <div className="stack-cards">
              {[
                { t: 'Existing store', d: 'Keep your design system, checkout, and CMS.' },
                { t: 'Flexible subscription', d: 'Month-to-month pricing scaled to your catalog.' },
                { t: 'Partner onboarding', d: 'Hands-on setup — you are never left alone.' },
              ].map((c, i) => (
                <motion.article
                  className="card"
                  key={c.t}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...t(0.55), delay: reduce ? 0 : i * 0.08 }}
                >
                  <h3>{c.t}</h3>
                  <p>{c.d}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* WHO IT'S FOR */}
        <section className="block block--soft" id="audience">
          <SectionHead
            kicker="Who it is for"
            title="Built for retailers who refuse to leave their stack behind."
            align="center"
          />
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

        {/* PRICING TEASER */}
        <section className="block" id="pricing">
          <SectionHead
            kicker="Pricing"
            title="Simple commercial model. Serious support."
            sub="No opaque enterprise maze. Start with a subscription that matches your catalog depth and growth plans."
          />
          <div className="price-grid">
            <motion.article
              className="price-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={t(0.6)}
            >
              <span className="price-card__label">Starter pilot</span>
              <h3>Prove value on a focused catalog</h3>
              <ul>
                <li>Selected product categories</li>
                <li>Integration &amp; asset guidance</li>
                <li>Monthly subscription</li>
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
              transition={{ ...t(0.6), delay: reduce ? 0 : 0.1 }}
            >
              <span className="price-card__label">Growth</span>
              <h3>Scale across the full assortment</h3>
              <ul>
                <li>Multi-category rollout</li>
                <li>Priority onboarding</li>
                <li>Ongoing optimization</li>
              </ul>
              <a className="btn" href={EMAIL}>
                Book a walkthrough
              </a>
            </motion.article>
          </div>
        </section>

        {/* ABOUT */}
        <section className="block block--soft" id="about">
          <div className="about-layout">
            <div>
              <SectionHead
                kicker="About Vyro"
                title="An Omani AI startup making shopping feel real."
              />
              <p className="about-copy">
                We build virtual try-on so retailers across Oman and the GCC can offer a
                premium experience without rewriting their digital store. See Beyond —
                that is the mission.
              </p>
              <p className="about-copy">
                From the first embed to a live shopper session, our focus stays practical:
                track well, look premium, and stay easy to operate.
              </p>
            </div>
            <div className="about-stats">
              {[
                ['Oman → GCC', 'Regional roots, regional ambition'],
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

        {/* FAQ */}
        <section className="block" id="faq">
          <SectionHead
            kicker="FAQ"
            title="Straight answers for busy retailers."
          />
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

        {/* FINAL CTA */}
        <section className="finale">
          <motion.div
            className="finale__card"
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={t(0.75)}
          >
            <h2>Give every shopper a fitting room — without leaving your site.</h2>
            <p>
              Book a walkthrough, or jump straight into the live try-on and feel the
              difference yourself.
            </p>
            <div className="hero__cta">
              <a className="btn" href={EMAIL}>
                Book a demo
              </a>
              <a className="btn btn--ghost" href={DEMO_URL} target="_blank" rel="noreferrer">
                Try it live
              </a>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="footer" id="contact">
        <div className="footer__top">
          <div>
            <a className="brand" href="#top">
              <img src="/brand/icon-dark.PNG" alt="" />
              <span>VYRO</span>
            </a>
            <p>AI virtual try-on that integrates into the store you already run.</p>
          </div>
          <div className="footer__cols">
            <div>
              <h4>Explore</h4>
              <a href="#platform">Platform</a>
              <a href="#experience">Experience</a>
              <a href="#integrate">Integrate</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <h4>Contact</h4>
              <a href={EMAIL}>hello@vyro.om</a>
              <a href={DEMO_URL} target="_blank" rel="noreferrer">
                Live demo
              </a>
            </div>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© 2026 Vyro · Omanitechology</span>
          <span>See Beyond.</span>
        </div>
      </footer>
    </div>
  );
}
