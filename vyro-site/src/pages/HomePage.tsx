import { Link } from 'react-router-dom';
import { HeroVisual } from '../components/site/HeroVisual';
import { useRedesignEffects } from '../hooks/useRedesignEffects';
import { EMAIL, INSTAGRAM, openMeetingModal } from '../lib/constants';
import './Redesign.css';

const SERVE = [
  { ic: '👓', label: 'Eyewear Stores' },
  { ic: '⌚', label: 'Watch Retailers' },
  { ic: '💍', label: 'Jewelry Stores' },
  { ic: '👜', label: 'Fashion & Accessories Brands' },
  { ic: '🛒', label: 'E-commerce Websites' },
  { ic: '🏬', label: 'Online Marketplaces' },
] as const;

const FAQ = [
  {
    q: 'Do I need to build a new website?',
    a: 'No. Vyro integrates directly with your existing online store — no migration or rebuild needed.',
  },
  {
    q: 'How is pricing structured?',
    a: 'We offer flexible monthly subscription plans tailored to your business needs. Contact us for a personalized quote.',
  },
  {
    q: 'What products does Vyro support?',
    a: 'Currently, Vyro supports glasses, watches, jewelry, and fashion accessories, with more categories planned in the future.',
  },
  {
    q: 'How do I get started?',
    a: "Simply book a demo or contact our team, and we'll guide you through the integration process.",
  },
] as const;

export function HomePage() {
  useRedesignEffects(true);

  return (
    <>
      <section className="hero" id="home">
        <div className="hero-inner">
          <div>
            <span className="eyebrow">AI Virtual Try-On for Online Retailers</span>
            <h1 className="hero-title">
              <span className="l1">
                <span className="word">Make</span> <span className="word">Online</span>{' '}
                <span className="word">Shopping</span> <span className="word">Feel</span>{' '}
                <span className="word">Real.</span>
              </span>
              <br />
              <span className="grad">
                <span className="word">Try</span> <span className="word">Before</span>{' '}
                <span className="word">They</span> <span className="word">Buy.</span>
              </span>
            </h1>
            <p className="hero-sub">
              Enhance your existing online store with realistic virtual try-on. Vyro integrates
              seamlessly through a flexible monthly subscription — helping businesses create more
              engaging shopping experiences while giving customers the confidence to buy.
            </p>
            <div className="hero-actions">
              <Link className="btn-primary" to="/try-on">
                <span>Try Virtual Try-On</span>
              </Link>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => openMeetingModal()}
              >
                Book a Meeting
              </button>
            </div>
            <div className="hero-badges">
              <span className="badge-pill">🏢 Omani Startup</span>
              <span className="badge-pill">👓 4 Product Categories</span>
              <span className="badge-pill">🔗 Works with Your Existing Store</span>
              <span className="badge-pill">📅 Flexible Monthly Subscription</span>
            </div>
            <div className="stat-boxes">
              <div className="stat-box">
                <div className="n" data-count="94" data-suffix="%">
                  0%
                </div>
                <div className="l">higher conversion with AR &amp; 3D product content</div>
              </div>
              <div className="stat-box">
                <div className="n" data-count="20" data-suffix="%">
                  0%
                </div>
                <div className="l">more jewelry sales with virtual try-on</div>
              </div>
              <div className="stat-box">
                <div className="n" data-count="40" data-suffix="%">
                  0%
                </div>
                <div className="l">fewer returns on gold &amp; watches</div>
              </div>
              <div className="stat-box">
                <div className="n" data-count="60" data-suffix="%">
                  0%
                </div>
                <div className="l">of shoppers prefer stores with virtual try-on</div>
              </div>
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="section panel" id="why">
        <div className="reveal">
          <span className="kicker">Why Vyro</span>
          <h2 className="section-title">
            Built for modern retailers, not for rebuilding your website.
          </h2>
          <p className="section-sub">
            Vyro slots into what you already have — no migration, no new platform, no long dev
            cycles.
          </p>
        </div>
        <div className="bento">
          <div className="bento-card reveal">
            <div className="bento-icon">⚡</div>
            <h3>Easy integration</h3>
            <p>Works with your existing website — no rebuild, no platform switch.</p>
            <div className="bento-stat">Live in as little as 2 weeks</div>
          </div>
          <div className="bento-card reveal">
            <div className="bento-icon">👁️</div>
            <h3>Realistic try-on</h3>
            <p>AI-rendered try-on that looks convincing enough to replace guesswork.</p>
            <div className="bento-stat">Up to 94% conversion lift</div>
          </div>
          <div className="bento-card reveal">
            <div className="bento-icon">💳</div>
            <h3>Flexible subscription</h3>
            <p>Simple monthly pricing that scales with your catalog — no big upfront cost.</p>
            <div className="bento-stat">Month-to-month, cancel anytime</div>
          </div>
          <div className="bento-card reveal">
            <div className="bento-icon">🤝</div>
            <h3>Dedicated onboarding</h3>
            <p>Our team sets it up with you, end to end — you&apos;re never doing this alone.</p>
            <div className="bento-stat">Hands-on support included</div>
          </div>
        </div>
      </section>

      <section className="section" id="solutions">
        <div className="reveal">
          <span className="kicker">Solutions</span>
          <h2 className="section-title">One solution. Multiple industries.</h2>
        </div>
        <div className="solutions-grid">
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <polygon
                points="56,60 46,42.68 26,42.68 16,60 26,77.32 46,77.32"
                stroke="url(#ig1)"
                strokeWidth="5"
              />
              <polygon
                points="104,60 94,42.68 74,42.68 64,60 74,77.32 94,77.32"
                stroke="url(#ig1)"
                strokeWidth="5"
              />
              <line x1="56" y1="60" x2="64" y2="60" stroke="url(#ig1)" strokeWidth="5" />
            </svg>
            <h3>Eyewear</h3>
            <p>Help customers try on frames before purchasing.</p>
          </div>
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <circle cx="60" cy="60" r="36" stroke="url(#ig1)" strokeWidth="5" />
              <line
                x1="60"
                y1="60"
                x2="48"
                y2="42"
                stroke="url(#ig1)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            <h3>Watches</h3>
            <p>Allow shoppers to compare watch styles with confidence.</p>
          </div>
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <circle cx="60" cy="78" r="28" stroke="url(#ig1)" strokeWidth="8" />
              <polygon points="60,24 72,38 60,52 48,38" fill="url(#ig1)" />
            </svg>
            <h3>Jewelry</h3>
            <p>Create a more interactive online shopping experience.</p>
          </div>
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <path
                d="M38,48 Q38,24 60,24 Q82,24 82,48"
                stroke="url(#ig1)"
                strokeWidth="5"
                fill="none"
              />
              <rect x="28" y="48" width="64" height="48" rx="10" stroke="url(#ig1)" strokeWidth="5" />
            </svg>
            <h3>Fashion &amp; Accessories</h3>
            <p>Help customers make more confident purchasing decisions.</p>
          </div>
        </div>
        <p className="section-sub" style={{ marginTop: 40 }}>
          Also perfect for:
        </p>
        <div className="marquee-wrap reveal">
          <div className="marquee-track" id="marqueeTrack">
            {SERVE.map((item) => (
              <div className="serve-card" key={item.label}>
                <span className="ic">{item.ic}</span>
                <span className="label">{item.label}</span>
              </div>
            ))}
            {SERVE.map((item) => (
              <div className="serve-card" key={`${item.label}-dup`}>
                <span className="ic">{item.ic}</span>
                <span className="label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tight panel" id="categories">
        <div className="reveal">
          <span className="kicker">Product Categories</span>
          <h2 className="section-title">Four categories, one seamless try-on experience.</h2>
        </div>
        <div className="cat-grid">
          <div className="cat-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <polygon
                points="56,60 46,42.68 26,42.68 16,60 26,77.32 46,77.32"
                stroke="url(#ig1)"
                strokeWidth="4"
              />
              <polygon
                points="104,60 94,42.68 74,42.68 64,60 74,77.32 94,77.32"
                stroke="url(#ig1)"
                strokeWidth="4"
              />
              <line x1="56" y1="60" x2="64" y2="60" stroke="url(#ig1)" strokeWidth="4" />
              <line
                x1="16"
                y1="60"
                x2="2"
                y2="50"
                stroke="url(#ig1)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line
                x1="104"
                y1="60"
                x2="118"
                y2="50"
                stroke="url(#ig1)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <span>Glasses</span>
          </div>
          <div className="cat-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <circle cx="60" cy="60" r="34" stroke="url(#ig1)" strokeWidth="4" />
              <rect x="93" y="53" width="9" height="14" rx="2" stroke="url(#ig1)" strokeWidth="3.5" />
              <line
                x1="60"
                y1="60"
                x2="48"
                y2="44"
                stroke="url(#ig1)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line
                x1="60"
                y1="60"
                x2="74"
                y2="42"
                stroke="url(#ig1)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span>Watches</span>
          </div>
          <div className="cat-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <circle cx="60" cy="76" r="26" stroke="url(#ig1)" strokeWidth="8" />
              <polygon points="60,24 71,36 60,48 49,36" fill="url(#ig1)" />
            </svg>
            <span>Jewelry</span>
          </div>
          <div className="cat-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <path
                d="M40,50 Q40,28 60,28 Q80,28 80,50"
                stroke="url(#ig1)"
                strokeWidth="4"
                fill="none"
              />
              <rect x="30" y="50" width="60" height="46" rx="10" stroke="url(#ig1)" strokeWidth="4" />
            </svg>
            <span>Fashion Accessories</span>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="reveal">
          <span className="kicker">How It Works</span>
          <h2 className="section-title">Getting started is simple.</h2>
        </div>
        <div className="steps">
          <div className="step reveal">
            <div className="step-num">01</div>
            <h3>Contact our team</h3>
            <p>
              Tell us about your business and requirements — we&apos;ll scope it with you.
            </p>
          </div>
          <div className="step reveal">
            <div className="step-num">02</div>
            <h3>Seamless integration</h3>
            <p>We integrate Vyro into your existing online store — no rebuild required.</p>
          </div>
          <div className="step reveal">
            <div className="step-num">03</div>
            <h3>Go live</h3>
            <p>Your customers immediately enjoy virtual try-on, right on your website.</p>
          </div>
        </div>
      </section>

      <section className="section panel" id="technology">
        <div className="reveal">
          <span className="kicker">Technology Behind Every Try-On</span>
          <h2 className="section-title">Three Layers Behind Every Session.</h2>
          <p className="section-sub">
            Three technologies work together to deliver a fast, stable and realistic virtual try-on
            experience.
          </p>
        </div>
        <div className="tech-grid">
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <circle cx="60" cy="52" r="26" stroke="url(#ig1)" strokeWidth="5" />
              <path
                d="M30,96 Q60,78 90,96"
                stroke="url(#ig1)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
              <circle cx="50" cy="50" r="3" fill="url(#ig1)" />
              <circle cx="70" cy="50" r="3" fill="url(#ig1)" />
            </svg>
            <h3>Face Tracking</h3>
            <p>Keeps glasses and facial accessories perfectly aligned.</p>
          </div>
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <path
                d="M40,70 V38 a6,6 0 0 1 12,0 V60"
                stroke="url(#ig1)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M52,60 V32 a6,6 0 0 1 12,0 V60"
                stroke="url(#ig1)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M64,60 V36 a6,6 0 0 1 12,0 V64"
                stroke="url(#ig1)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M40,70 a20,26 0 0 0 40,0 V64"
                stroke="url(#ig1)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <h3>Motion Tracking</h3>
            <p>Tracks hand and wrist movement for watches, rings and bracelets.</p>
          </div>
          <div className="solution-card reveal">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <circle cx="60" cy="60" r="34" stroke="url(#ig1)" strokeWidth="5" />
              <circle cx="60" cy="60" r="6" fill="url(#ig1)" />
              <line
                x1="60"
                y1="16"
                x2="60"
                y2="30"
                stroke="url(#ig1)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <line
                x1="60"
                y1="90"
                x2="60"
                y2="104"
                stroke="url(#ig1)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <line
                x1="16"
                y1="60"
                x2="30"
                y2="60"
                stroke="url(#ig1)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <line
                x1="90"
                y1="60"
                x2="104"
                y2="60"
                stroke="url(#ig1)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            <h3>Real-Time Alignment</h3>
            <p>Maintains accurate positioning while users move naturally.</p>
          </div>
        </div>
      </section>

      <section className="section section-tight" id="demo">
        <div className="reveal">
          <span className="kicker">Demo</span>
          <h2 className="section-title">See Vyro in action.</h2>
        </div>
        <div className="demo-frame reveal">
          <div className="phone-float">
            <div className="phone-mock">
              <div className="notch" />
              <div className="screen">
                <img src="/demo/phone-1.png" alt="Vyro virtual try-on — watch" />
              </div>
            </div>
          </div>
          <div className="phone-float">
            <div className="phone-mock">
              <div className="notch" />
              <div className="screen">
                <img src="/demo/phone-2.jpeg" alt="Vyro virtual try-on — glasses" />
              </div>
            </div>
          </div>
          <div className="phone-float">
            <div className="phone-mock">
              <div className="notch" />
              <div className="screen">
                <img src="/demo/phone-3.jpeg" alt="Vyro virtual try-on — jewelry" />
              </div>
            </div>
          </div>
        </div>
        <div className="demo-caption reveal">Live try-on, straight from a customer&apos;s browser</div>
      </section>

      <section className="section section-tight panel" id="faq">
        <div className="reveal">
          <span className="kicker">FAQ</span>
          <h2 className="section-title">Questions, answered.</h2>
        </div>
        <div className="faq-list">
          {FAQ.map((item) => (
            <div className="faq-item reveal" key={item.q}>
              <div className="faq-q">
                <span>{item.q}</span>
                <svg className="faq-chev" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M4 10h12M10 4v12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="faq-a">
                <div className="faq-a-inner">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-tight" id="about">
        <div className="reveal">
          <span className="kicker">About</span>
          <h2 className="section-title">About Vyro</h2>
        </div>
        <div className="about-wrap">
          <div className="reveal">
            <p>
              Vyro is an Omani startup helping retailers create more engaging online shopping
              experiences through virtual try-on.
            </p>
            <p>
              Our mission is to make virtual try-on simple to adopt by integrating seamlessly into
              existing e-commerce websites — allowing businesses to enhance the shopping experience
              without rebuilding their platforms.
            </p>
            <p>
              We&apos;re building solutions that help retailers increase customer confidence and
              create a more interactive online shopping journey.
            </p>
          </div>
          <div className="about-stats reveal">
            <div className="about-stat">
              <div className="n">Oman → GCC</div>
              <div className="l">Founded in Oman, built for the region</div>
            </div>
            <div className="about-stat">
              <div className="n">4</div>
              <div className="l">Product categories at launch</div>
            </div>
            <div className="about-stat">
              <div className="n">1</div>
              <div className="l">Integration, no platform switch</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="cta-band reveal">
          <h2>Ready to Transform Your Online Store?</h2>
          <p>Let&apos;s bring virtual try-on to your customers.</p>
          <div className="hero-actions">
            <Link className="btn-primary" to="/try-on">
              <span>Try Virtual Try-On</span>
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => openMeetingModal()}
            >
              Book a Meeting
            </button>
          </div>
        </div>
      </section>

      <footer id="contact">
        <span className="kicker">Contact</span>
        <h3>Let&apos;s Talk</h3>
        <p style={{ color: 'var(--ink-body)', maxWidth: 440, margin: '0 auto 8px' }}>
          Interested in bringing virtual try-on to your business?
        </p>
        <div className="hero-actions">
          <Link className="btn-primary" to="/try-on">
            <span>Try Virtual Try-On</span>
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => openMeetingModal()}
          >
            Book a Meeting
          </button>
        </div>
        <div className="contact-links">
          <a href={EMAIL}>info@vyroes.tech</a>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
        </div>
        <div className="foot-meta">
          <span>VYRO — AI VIRTUAL TRY-ON</span>
          <span>OMAN → GCC</span>
          <span>© 2026</span>
        </div>
      </footer>
    </>
  );
}
