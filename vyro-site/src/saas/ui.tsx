/**
 * VYRO console component library. Every screen is assembled from these; the
 * visual rules live in styles/tokens.css and styles/console.css.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ArrowDown, ArrowUp, Check, CircleAlert, Copy, X } from 'lucide-react';
import { STATUS_LABEL, type Invoice, type SubscriptionStatus } from './api';

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

/* ---------------------------------------------------------------- Button */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
  size?: 'md' | 'sm';
  busy?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  block,
  icon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'vy-btn',
    `vy-btn--${variant}`,
    size === 'sm' && 'vy-btn--sm',
    block && 'vy-btn--block',
    !children && 'vy-btn--icon',
    busy && 'is-busy',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Forms */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="vy-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Input with a unit shown inside it (e.g. OMR, days). */
export function Affix({ unit, children }: { unit: string; children: ReactNode }) {
  return (
    <div className="vy-affix">
      {children}
      <span>{unit}</span>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="vy-notice vy-notice--bad" role="alert">
      <CircleAlert />
      <div>{message}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Layout */

export function PageHead({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="vy-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="vy-head__actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  action,
  foot,
  flush,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  foot?: ReactNode;
  /** Content runs edge to edge (tables, feeds) */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`vy-panel ${flush ? 'vy-panel--flush' : ''}`}>
      {(title || action) && (
        <header className="vy-panel__head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="vy-panel__body">{children}</div>
      {foot && <footer className="vy-panel__foot">{foot}</footer>}
    </section>
  );
}

export function Facts({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="vy-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface Metric {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: 'bad';
  wide?: boolean;
}

/** One band of figures with hairline dividers, instead of a row of cards. */
export function Ledger({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="vy-ledger" style={{ ['--cols' as string]: metrics.length }}>
      {metrics.map((m) => (
        <div key={m.label} className={[m.tone === 'bad' && 'is-bad', m.wide && 'is-wide'].filter(Boolean).join(' ')}>
          <dt>{m.label}</dt>
          <dd>
            {m.value}
            {m.unit && <small>{m.unit}</small>}
          </dd>
          {m.note && <p>{m.note}</p>}
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- Status */

export function Status({
  tone = 'idle',
  live,
  plain,
  children,
}: {
  tone?: Tone;
  live?: boolean;
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={['vy-status', `vy-status--${tone}`, live && 'vy-status--live', plain && 'vy-status--plain']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

const SUB_TONE: Record<SubscriptionStatus, Tone> = {
  active: 'ok',
  pending_setup: 'warn',
  past_due: 'bad',
  cancel_scheduled: 'warn',
  cancelled: 'idle',
  suspended: 'bad',
};
const SUB_SHORT: Record<SubscriptionStatus, string> = {
  active: 'Active',
  pending_setup: 'Awaiting setup',
  past_due: 'Overdue',
  cancel_scheduled: 'Cancelling',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
};

export function SubStatus({ status, long }: { status: SubscriptionStatus; long?: boolean }) {
  return <Status tone={SUB_TONE[status]}>{long ? STATUS_LABEL[status] : SUB_SHORT[status]}</Status>;
}

export function InvoiceStatus({ status }: { status: Invoice['status'] }) {
  const tone: Tone = ({ paid: 'ok', open: 'warn', processing: 'warn', failed: 'bad', void: 'idle' } as const)[status];
  const label = { paid: 'Paid', open: 'Due', processing: 'Processing', failed: 'Failed', void: 'Void' }[status];
  return <Status tone={tone}>{label}</Status>;
}

/** Whether VYRO is running on the client's website right now. */
export function LiveStatus({ live }: { live: boolean }) {
  return (
    <Status tone={live ? 'ok' : 'idle'} live={live} plain>
      {live ? 'Widget on' : 'Widget off'}
    </Status>
  );
}

export function Avatar({
  name,
  src,
  size,
  round,
}: {
  name: string;
  src?: string | null;
  size?: 'lg';
  round?: boolean;
}) {
  return (
    <span className={['vy-avatar', size && `vy-avatar--${size}`, round && 'vy-avatar--round'].filter(Boolean).join(' ')} aria-hidden>
      {src ? <img src={src} alt="" /> : name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

/* ------------------------------------------------------------------ Tabs */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  countTone?: 'bad';
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  inset,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  inset?: boolean;
  label: string;
}) {
  return (
    <div className={`vy-tabs ${inset ? 'vy-tabs--inset' : ''}`} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={value === t.id ? 'is-active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={`vy-count ${t.countTone === 'bad' ? 'vy-count--bad' : ''}`}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: { id: T; label: string; danger?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="vy-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          className={o.danger ? 'is-danger' : ''}
          disabled={disabled}
          onClick={() => value !== o.id && onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Table */

export type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' };

export function SortTh<K extends string>({
  id,
  sort,
  onSort,
  num,
  children,
}: {
  id: K;
  sort: SortState<K>;
  onSort: (s: SortState<K>) => void;
  num?: boolean;
  children: ReactNode;
}) {
  const active = sort.key === id;
  return (
    <th className={num ? 'is-num' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => onSort({ key: id, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
      >
        {children}
        {active && (sort.dir === 'asc' ? <ArrowUp /> : <ArrowDown />)}
      </button>
    </th>
  );
}

export function usePager<T>(rows: T[], size = 12) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(current * size, current * size + size), [rows, current, size]);
  return { slice, page: current, pages, setPage, total: rows.length, size };
}

export function Pager({
  page,
  pages,
  total,
  size,
  setPage,
  noun,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  setPage: (p: number) => void;
  noun: string;
}) {
  if (total === 0) return null;
  const from = page * size + 1;
  const to = Math.min(total, from + size - 1);
  return (
    <div className="vy-pager">
      <span className="vy-num">
        {from}–{to} of {total} {noun}
      </span>
      {pages > 1 && (
        <div className="vy-actions">
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------- Empty / loading */

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="vy-empty">
      {icon}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="vy-skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="vy-skel" style={{ width: `${88 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function Notice({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone?: 'warn' | 'bad' | 'ok';
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={['vy-notice', tone && `vy-notice--${tone}`, action && 'vy-notice--cta'].filter(Boolean).join(' ')}>
      {icon}
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- Chart */

export interface Bar {
  label: string;
  value: number;
  tip: string;
  current?: boolean;
}

export function BarChart({ bars, label }: { bars: Bar[]; label: string }) {
  const peak = Math.max(1, ...bars.map((b) => b.value));
  return (
    <figure style={{ margin: 0 }} aria-label={label}>
      <div className="vy-chart">
        {bars.map((b, i) => (
          <div key={b.label + i} className={`vy-chart__col ${b.current ? 'is-current' : ''}`} tabIndex={0}>
            <span className="vy-chart__tip">{b.tip}</span>
            <div
              className="vy-chart__bar"
              style={{ height: `${(b.value / peak) * 100}%`, animationDelay: `${i * 40}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="vy-chart__axis">
        {bars.map((b, i) => (
          <span key={b.label + i}>{b.label}</span>
        ))}
      </div>
    </figure>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={`vy-meter ${value >= max ? 'is-full' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* --------------------------------------------------------------- Popover */

export function Popover({
  trigger,
  children,
  align,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'up' | 'left';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="vy-pop" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && (
        <div className={`vy-pop__panel ${align ? `vy-pop__panel--${align}` : ''}`}>{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  drawer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Side sheet on desktop, bottom sheet on phones */
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`vy vy-dialog ${drawer ? 'vy-dialog--drawer' : ''}`}
      style={{ minHeight: 0 }}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <>
          <div className="vy-dialog__head">
            <h2>{title}</h2>
            <button type="button" className="vy-iconbtn" aria-label="Close" onClick={onClose}>
              <X />
            </button>
          </div>
          <div className="vy-dialog__body">{children}</div>
          {footer && <div className="vy-dialog__foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

interface AskOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask for a line of text; the promise then resolves to the text */
  input?: { label: string; placeholder?: string; required?: boolean };
}

type AskResult = string | boolean | null;
const AskCtx = createContext<(o: AskOptions) => Promise<AskResult>>(() => Promise.resolve(null));
const ToastCtx = createContext<(message: string, tone?: 'ok' | 'bad') => void>(() => {});

/** Confirmation dialogs and toasts for the whole console. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<(AskOptions & { resolve: (r: AskResult) => void }) | null>(null);
  const [text, setText] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'ok' | 'bad' }[]>([]);
  const seq = useRef(0);

  const open = useCallback(
    (o: AskOptions) =>
      new Promise<AskResult>((resolve) => {
        setText('');
        setAsk({ ...o, resolve });
      }),
    [],
  );
  const finish = (r: AskResult) => {
    ask?.resolve(r);
    setAsk(null);
  };
  const toast = useCallback((message: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    finish(ask?.input ? text.trim() : true);
  };

  return (
    <AskCtx.Provider value={open}>
      <ToastCtx.Provider value={toast}>
        {children}
        <Dialog open={!!ask} onClose={() => finish(null)} title={ask?.title ?? ''}>
          <form onSubmit={submit} style={{ display: 'contents' }}>
            {ask?.body && <p>{ask.body}</p>}
            {ask?.input && (
              <Field label={ask.input.label}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={ask.input.placeholder}
                  required={ask.input.required}
                  autoFocus
                />
              </Field>
            )}
            <div className="vy-actions vy-actions--end">
              <Button onClick={() => finish(null)}>Cancel</Button>
              <Button type="submit" variant={ask?.danger ? 'danger-solid' : 'primary'}>
                {ask?.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </form>
        </Dialog>
        <div className="vy vy-toasts" style={{ minHeight: 0, background: 'none' }} role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`vy-toast ${t.tone === 'bad' ? 'vy-toast--bad' : ''}`}>
              {t.tone === 'bad' ? <CircleAlert /> : <Check />}
              {t.message}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </AskCtx.Provider>
  );
}

export const useAsk = () => useContext(AskCtx);
export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------------ Misc */

export function CodeBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="vy-code">
      <code>{value}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** Runs an async action with a busy flag; failures surface as a toast and an inline message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const run = async (fn: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (success) toast(success);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      toast(message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
