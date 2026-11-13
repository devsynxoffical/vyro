import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { STATUS_LABEL, type Invoice, type SubscriptionStatus } from './api';

export function Shell({ title, nav, children }: { title: string; nav?: ReactNode; children: ReactNode }) {
  const { profile, signOut } = useAuth();
  return (
    <div className="sa">
      <header className="sa-top">
        <Link to={profile?.role === 'admin' ? '/admin' : '/portal'} className="sa-brand">
          VYRO <span>{title}</span>
        </Link>
        <nav className="sa-nav">{nav}</nav>
        <button className="sa-btn sa-btn--ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main className="sa-main">{children}</main>
    </div>
  );
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sa-card">
      {(title || action) && (
        <div className="sa-card__head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE: Record<SubscriptionStatus, string> = {
  active: 'good',
  pending_setup: 'wait',
  past_due: 'warn',
  cancel_scheduled: 'wait',
  cancelled: 'off',
  suspended: 'bad',
};

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={`sa-badge sa-badge--${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function InvoiceBadge({ status }: { status: Invoice['status'] }) {
  const tone = { paid: 'good', open: 'wait', processing: 'wait', failed: 'bad', void: 'off' }[status];
  const label = { paid: 'Paid', open: 'Due', processing: 'Processing', failed: 'Failed', void: 'Void' }[status];
  return <span className={`sa-badge sa-badge--${tone}`}>{label}</span>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="sa-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <p className="sa-error" role="alert">
      {message}
    </p>
  ) : null;
}

/** Runs an async action with a busy flag and a readable error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sa-copy">
      <code>{value}</code>
      <button
        className="sa-btn sa-btn--small"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
