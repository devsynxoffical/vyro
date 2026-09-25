import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_URL, EMAIL, openMeetingModal } from '../../lib/constants';

export function scrollToContactSection() {
  const el = document.getElementById('contact');
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export function BookDemoButton({
  className = 'btn btn-primary',
  children,
  onAfter,
}: {
  className?: string;
  children?: ReactNode;
  onAfter?: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        openMeetingModal();
        onAfter?.();
      }}
    >
      {children ?? <span>Book a Demo</span>}
    </button>
  );
}

export function RequestPricingButton({
  className = 'btn btn--ghost',
  children = 'Request Pricing',
  onAfter,
}: {
  className?: string;
  children?: ReactNode;
  onAfter?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    if (pathname === '/') {
      scrollToContactSection();
      onAfter?.();
      return;
    }
    navigate({ pathname: '/', hash: 'contact' });
    onAfter?.();
  };

  return (
    <a href="/#contact" className={className} onClick={onClick}>
      {children}
    </a>
  );
}

export function TryOnLink({
  className = 'btn btn--ghost',
  children = 'Try it live',
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link className={className} to={DEMO_URL}>
      {children}
    </Link>
  );
}

export function PricingEmailLink({
  className = 'btn btn--ghost',
  children = 'Request Pricing',
}: {
  className?: string;
  children?: ReactNode;
}) {
  const subject = encodeURIComponent('Vyro pricing request');
  return (
    <a className={className} href={`${EMAIL}?subject=${subject}`}>
      {children}
    </a>
  );
}

export function HomeHashLink({
  hash,
  className,
  children,
  onNavigate,
}: {
  hash: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const id = hash.replace(/^#/, '');

  if (pathname === '/') {
    return (
      <a href={hash} className={className} onClick={onNavigate}>
        {children}
      </a>
    );
  }

  return (
    <Link to={{ pathname: '/', hash: id }} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}
