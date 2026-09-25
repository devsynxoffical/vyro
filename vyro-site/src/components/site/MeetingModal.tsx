import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EMAIL } from '../../lib/constants';

type MeetingModalProps = {
  open: boolean;
  onClose: () => void;
};

export function MeetingModal({ open, onClose }: MeetingModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lastFocused = useRef<Element | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;

    setShowSuccess(false);
    setSubmitting(false);
    formRef.current?.reset();
    lastFocused.current = document.activeElement;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dateField = document.getElementById('mDate') as HTMLInputElement | null;
    if (dateField) {
      dateField.min = new Date().toISOString().split('T')[0];
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    const focusTimer = window.setTimeout(() => {
      document.getElementById('mName')?.focus();
    }, 300);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
      if (lastFocused.current instanceof HTMLElement) {
        lastFocused.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setSubmitting(true);
    try {
      const res = await fetch('/send-meeting.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setShowSuccess(true);
        return;
      }
      throw new Error(json?.error || 'Failed to send via server');
    } catch {
      const lines = [
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        data.phone ? `Phone: ${data.phone}` : null,
        `Meeting goal: ${data.goal}`,
        `Preferred date: ${data.date}`,
        `Best time: ${data.time}`,
        data.message ? `Message: ${data.message}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const subject = encodeURIComponent(`Meeting request — ${data.goal}`);
      const body = encodeURIComponent(lines);
      window.location.href = `${EMAIL}?subject=${subject}&body=${body}`;
      setShowSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`modal-overlay open`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="meetingTitle"
      aria-hidden="false"
      lang="en"
      dir="ltr"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="modal-inner">
          {!showSuccess ? (
            <div className="modal-view" id="meetingFormView">
              <div className="modal-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M16 3v4M8 3v4M3 11h18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h3 id="meetingTitle" className="modal-title">
                Let&apos;s find a time to talk.
              </h3>
              <p className="modal-sub">
                Tell us a bit about what you need, and pick the time that works best for you.
              </p>

              <form id="meetingForm" ref={formRef} noValidate onSubmit={onSubmit}>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="mName">Name</label>
                    <div className="input-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.7" />
                        <path
                          d="M4.5 20c1-4 4.2-6 7.5-6s6.5 2 7.5 6"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                      <input
                        type="text"
                        id="mName"
                        name="name"
                        placeholder="Your full name"
                        required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="mEmail">Email</label>
                    <div className="input-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect
                          x="3"
                          y="5.5"
                          width="18"
                          height="13"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                        <path
                          d="M3.5 6.5l8.5 6 8.5-6"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <input
                        type="email"
                        id="mEmail"
                        name="email"
                        placeholder="you@company.com"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="mPhone">
                      Phone <span className="opt">(optional)</span>
                    </label>
                    <div className="input-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M7 3.5h2.4l1.2 4-2 1.6a10 10 0 0 0 5.3 5.3l1.6-2 4 1.2V16a2 2 0 0 1-2 2.2C10.8 17.7 6.3 13.2 4.8 6.5A2 2 0 0 1 7 3.5z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <input type="tel" id="mPhone" name="phone" placeholder="+968 ..." />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="mGoal">Meeting goal</label>
                    <div className="input-wrap select-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.6" />
                        <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="1.6" />
                        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                      </svg>
                      <select id="mGoal" name="goal" required defaultValue="">
                        <option value="" disabled>
                          What&apos;s this meeting about?
                        </option>
                        <option>Product demo</option>
                        <option>Pricing &amp; subscription</option>
                        <option>Technical integration</option>
                        <option>Partnership</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="mDate">Preferred date</label>
                    <div className="input-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect
                          x="3"
                          y="5"
                          width="18"
                          height="16"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                        <path
                          d="M16 3v4M8 3v4M3 11h18"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                      <input type="date" id="mDate" name="date" lang="en" dir="ltr" required />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="mTime">Best time for you</label>
                    <div className="input-wrap select-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
                        <path
                          d="M12 7.5V12l3 2.2"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <select id="mTime" name="time" required defaultValue="">
                        <option value="" disabled>
                          Choose a time window
                        </option>
                        <option>Morning (9am – 12pm)</option>
                        <option>Afternoon (12pm – 4pm)</option>
                        <option>Evening (4pm – 7pm)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="mMessage">
                    Short message <span className="opt">(optional)</span>
                  </label>
                  <textarea
                    id="mMessage"
                    name="message"
                    rows={3}
                    placeholder="Anything you'd like us to know before we talk?"
                  />
                </div>

                <button type="submit" className="btn-primary modal-submit" disabled={submitting}>
                  <span>{submitting ? 'Sending Request…' : 'Request Meeting'}</span>
                </button>
                <p className="modal-note">
                  Direct submission to info@vyroes.tech with instant confirmation.
                </p>
              </form>
            </div>
          ) : (
            <div className="modal-view" id="meetingSuccessView">
              <div className="success-mark" aria-hidden>
                <svg viewBox="0 0 40 40" fill="none">
                  <path
                    d="M10 21l6 6 14-14"
                    stroke="#fff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="modal-title">Meeting Request Sent!</h3>
              <p className="modal-sub">
                Your meeting request has been submitted to <strong>info@vyroes.tech</strong>. Our team will review your preferred date &amp; time and confirm with you shortly.
              </p>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
