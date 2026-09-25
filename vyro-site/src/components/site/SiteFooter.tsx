import { EMAIL, openMeetingModal } from '../../lib/constants';

/** Footer for non-home routes only — home uses the redesign inline footer. */
export function SiteFooter() {
  return (
    <footer className="footer footer--contact" id="contact">
      <span className="kicker">Contact</span>
      <h3>Let&apos;s Talk</h3>
      <p className="footer__lede">
        Interested in bringing virtual try-on to your business?
      </p>
      <div className="hero__cta footer__cta">
        <a className="btn-primary" href={EMAIL}>
          <span>Request a Demo</span>
        </a>
        <a
          className="btn-ghost"
          href={EMAIL}
          onClick={(e) => {
            e.preventDefault();
            openMeetingModal();
          }}
        >
          Book a Meeting
        </a>
      </div>
      <div className="contact-links">
        <a className="contact-links__plain" href={EMAIL}>
          info@vyroes.tech
        </a>
        <a href="#">LinkedIn</a>
      </div>
      <div className="foot-meta">
        <span>VYRO — AI VIRTUAL TRY-ON</span>
        <span>OMAN → GCC</span>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
