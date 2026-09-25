import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AccIcon,
  GlassesIcon,
  JewelryIcon,
  WatchIcon,
} from './CategoryIcons';

const FACES = [
  { icon: <GlassesIcon />, label: 'Glasses' },
  { icon: <WatchIcon />, label: 'Watches' },
  { icon: <JewelryIcon />, label: 'Jewelry' },
  { icon: <AccIcon />, label: 'Accessories' },
];

export function HeroShowcase3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const wrap = wrapRef.current;
    const tilt = tiltRef.current;
    if (!wrap || !tilt || reduce) return;

    const onMove = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = `rotateX(${py * -12}deg) rotateY(${px * 12}deg)`;
    };
    const onLeave = () => {
      tilt.style.transform = '';
    };

    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', onLeave);
    return () => {
      wrap.removeEventListener('mousemove', onMove);
      wrap.removeEventListener('mouseleave', onLeave);
    };
  }, [reduce]);

  return (
    <motion.div
      className="showcase-wrap"
      ref={wrapRef}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.15 }}
    >
      <div className="float-chip chip1">
        <span className="live" />
        Try-on rendered
      </div>
      <div className="float-chip chip2">+20% jewelry conversion</div>

      <div className="showcase">
        <div className="showcase-tilt" ref={tiltRef}>
          <div className="showcase-ring">
            {FACES.map((face) => (
              <div className="showcase-face" key={face.label}>
                {face.icon}
                <span className="face-label">{face.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="showcase-glow" />
        <span className="sparkle" style={{ top: '12%', left: '18%' }} />
        <span
          className="sparkle"
          style={{ top: '22%', left: '78%', animationDelay: '0.9s' }}
        />
        <span
          className="sparkle"
          style={{ top: '74%', left: '22%', animationDelay: '1.7s' }}
        />
        <span
          className="sparkle"
          style={{ top: '80%', left: '72%', animationDelay: '2.3s' }}
        />
      </div>
    </motion.div>
  );
}
