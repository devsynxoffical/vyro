import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { easeOut } from '../../lib/motion';

type PageHeroProps = {
  kicker: string;
  title: string;
  sub: string;
  backLabel?: string;
  backTo?: string;
};

export function PageHero({ kicker, title, sub, backLabel = 'Back to home', backTo = '/' }: PageHeroProps) {
  const reduce = useReducedMotion();
  const t = (d = 0.65) => ({ duration: reduce ? 0 : d, ease: easeOut });

  return (
    <section className="page-hero">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t(0.7)}
      >
        <Link className="page-hero__back" to={backTo}>
          ← {backLabel}
        </Link>
        <span className="kicker">{kicker}</span>
        <h1 className="page-hero__title">{title}</h1>
        <p className="page-hero__sub">{sub}</p>
      </motion.div>
    </section>
  );
}
