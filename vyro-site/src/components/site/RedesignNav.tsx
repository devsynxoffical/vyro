import { Link } from 'react-router-dom';
import { SITE_ICON, openMeetingModal } from '../../lib/constants';

type RedesignNavProps = {
  scrolled: boolean;
};

export function RedesignNav({ scrolled }: RedesignNavProps) {
  return (
    <nav className={scrolled ? 'scrolled' : ''}>
      <Link className="logo" to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <img className="logo-mark" src={SITE_ICON} alt="" />
        VYRO
      </Link>
      <div className="navlinks">
        <a href="#why">Why Vyro</a>
        <a href="#how">How it works</a>
        <a href="#solutions">Solutions</a>
        <a href="#faq">FAQ</a>
      </div>
      <div className="nav-ctas">
        <button
          type="button"
          className="nav-link-btn"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={() => openMeetingModal()}
        >
          Book a Meeting
        </button>
        <Link className="nav-cta" to="/try-on">
          <span>Live Try-On</span>
        </Link>
      </div>
    </nav>
  );
}
