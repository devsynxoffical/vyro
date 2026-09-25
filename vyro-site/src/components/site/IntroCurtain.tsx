import { useEffect, useState } from 'react';

import { SITE_ICON } from '../../lib/constants';

type Phase = 'visible' | 'hiding' | 'done';

/** Matches HTML redesign: show on load, hide after 350ms with clip-path circle. */
export function IntroCurtain() {
  const [phase, setPhase] = useState<Phase>('visible');

  useEffect(() => {
    if (phase !== 'visible') return;
    const hide = () => setPhase('hiding');
    const t = window.setTimeout(hide, 350);
    window.addEventListener('keydown', hide, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', hide);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'hiding') return;
    // clip-path 1s + opacity delay 0.9s → remove after animation finishes
    const t = window.setTimeout(() => setPhase('done'), 1200);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div className={`curtain ${phase === 'hiding' ? 'hide' : ''}`} aria-hidden>
      <img className="curtain-mark" src={SITE_ICON} alt="" />
    </div>
  );
}
