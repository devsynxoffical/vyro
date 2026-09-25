import { useEffect } from 'react';
import { openMeetingModal } from '../lib/constants';

export function useRedesignEffects(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const cleanups: (() => void)[] = [];

    // Scroll reveal
    const revealEls = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const groupSiblings = Array.from(el.parentElement?.children ?? []).filter((c) =>
            c.classList.contains('reveal'),
          );
          const idx = groupSiblings.indexOf(el);
          el.style.transitionDelay = `${Math.min(idx * 90, 360)}ms`;
          el.classList.add('in');
          io.unobserve(el);
        });
      },
      { threshold: 0.15 },
    );
    revealEls.forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    // Stat counters
    const counters = document.querySelectorAll('.n[data-count]');
    const countIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const target = parseInt(el.getAttribute('data-count') ?? '0', 10);
          const suffix = el.getAttribute('data-suffix') ?? '';
          const dur = 1200;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / dur, 1);
            const eased = 1 - (1 - p) ** 3;
            el.textContent = `${Math.round(eased * target)}${suffix}`;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          countIo.unobserve(el);
        });
      },
      { threshold: 0.5 },
    );
    counters.forEach((c) => countIo.observe(c));
    cleanups.push(() => countIo.disconnect());

    // FAQ accordion
    document.querySelectorAll('.faq-item').forEach((item) => {
      const q = item.querySelector('.faq-q');
      const a = item.querySelector('.faq-a') as HTMLElement | null;
      if (!q || !a) return;
      const onClick = () => {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach((other) => {
          if (other !== item) {
            other.classList.remove('open');
            const otherA = other.querySelector('.faq-a') as HTMLElement | null;
            if (otherA) otherA.style.maxHeight = '';
          }
        });
        if (isOpen) {
          item.classList.remove('open');
          a.style.maxHeight = '';
        } else {
          item.classList.add('open');
          a.style.maxHeight = `${a.scrollHeight}px`;
        }
      };
      q.addEventListener('click', onClick);
      cleanups.push(() => q.removeEventListener('click', onClick));
    });

    // Meeting modal triggers
    document.querySelectorAll('[data-open-meeting]').forEach((el) => {
      const onClick = (e: Event) => {
        e.preventDefault();
        openMeetingModal();
      };
      el.addEventListener('click', onClick);
      cleanups.push(() => el.removeEventListener('click', onClick));
    });

    // Magnetic buttons
    document.querySelectorAll('.btn-primary, .btn-ghost, .nav-cta').forEach((btn) => {
      const el = btn as HTMLElement;
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.18}px, ${y * 0.3}px)`;
      };
      const onLeave = () => {
        el.style.transform = '';
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseleave', onLeave);
      });
    });

    // Blob parallax
    const blobs = document.querySelectorAll('.blob');
    let px = 0;
    let py = 0;
    let blobTicking = false;
    const onMouseMove = (e: MouseEvent) => {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
      if (!blobTicking) {
        blobTicking = true;
        requestAnimationFrame(() => {
          blobs.forEach((b, i) => {
            const depth = (i + 1) * 14;
            (b as HTMLElement).style.marginLeft = `${px * depth}px`;
            (b as HTMLElement).style.marginTop = `${py * depth}px`;
          });
          blobTicking = false;
        });
      }
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    cleanups.push(() => window.removeEventListener('mousemove', onMouseMove));

    // 3D tilt on cards
    document.querySelectorAll('.bento-card, .cat-card, .solution-card, .step').forEach((card) => {
      const el = card as HTMLElement;
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const cpx = (e.clientX - r.left) / r.width - 0.5;
        const cpy = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(700px) rotateX(${cpy * -8}deg) rotateY(${cpx * 8}deg) translateY(-6px)`;
      };
      const onLeave = () => {
        el.style.transform = '';
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseleave', onLeave);
      });
    });

    // Showcase tilt
    const showcaseEl = document.querySelector('.showcase-tilt') as HTMLElement | null;
    const heroVisual = document.querySelector('.hero-visual') as HTMLElement | null;
    if (showcaseEl && heroVisual) {
      const onMove = (e: MouseEvent) => {
        const r = heroVisual.getBoundingClientRect();
        const cpx = (e.clientX - r.left) / r.width - 0.5;
        const cpy = (e.clientY - r.top) / r.height - 0.5;
        showcaseEl.style.transform = `rotateX(${cpy * -10}deg) rotateY(${cpx * 10}deg)`;
      };
      const onLeave = () => {
        showcaseEl.style.transform = '';
      };
      heroVisual.addEventListener('mousemove', onMove);
      heroVisual.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        heroVisual.removeEventListener('mousemove', onMove);
        heroVisual.removeEventListener('mouseleave', onLeave);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [enabled]);
}
