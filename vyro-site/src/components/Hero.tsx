import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Hero.css';

const DEMO_URL = 'http://vyro.devsynx.com/';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero__glow" aria-hidden />
      <div className="container hero__content">
        <motion.p
          className="hero__badge"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          Virtual Try-On Platform · An Omanitechology Company
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
        >
          See Beyond.
          <span>Try before they buy.</span>
        </motion.h1>

        <motion.p
          className="hero__sub"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          Vyro integrates virtual try-on into the stores and marketplaces you
          already run — no rebuild, no app download.
        </motion.p>

        <motion.div
          className="hero__cta"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
        >
          <a className="btn btn--primary" href={DEMO_URL} target="_blank" rel="noreferrer">
            Try On Free
          </a>
          <Link className="btn btn--ghost" to="/demo">
            Book a Demo
          </Link>
        </motion.div>
      </div>

      <motion.div
        className="hero__stage container"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.22 }}
      >
        <div className="hero__frame">
          <img
            src="/brand/hero.png"
            alt="Vyro live virtual try-on dashboard"
          />
        </div>
      </motion.div>
    </section>
  );
}
