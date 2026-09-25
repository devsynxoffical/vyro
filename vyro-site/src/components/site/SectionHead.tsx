import { motion, useReducedMotion } from 'framer-motion';
import { fadeUp, stagger } from '../../lib/motion';

export function SectionHead({
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
