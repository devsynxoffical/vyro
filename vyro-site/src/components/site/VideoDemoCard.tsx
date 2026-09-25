import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { DEMO_URL } from '../../lib/constants';
import { easeOut } from '../../lib/motion';

export function VideoDemoCard() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: reduce ? 0 : 0.8, ease: easeOut }}
    >
      <Link className="video-card play-hit" to={DEMO_URL}>
        <img
          className="video-card__thumb"
          src="/demo/phone-3.jpeg"
          alt="Vyro try-on interface preview"
        />
        <div className="video-card__veil" />
        <div className="video-card__scan" />
        <div className="video-card__play" aria-hidden>
          <span />
        </div>
        <div className="video-card__meta">
          <strong>Open live try-on</strong>
          <span>Camera permission required · Runs in your browser</span>
        </div>
      </Link>
    </motion.div>
  );
}
