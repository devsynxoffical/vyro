/** Hero 3D showcase — markup matches vyro_landing_redesign (9).html */
export function HeroVisual() {
  return (
    <div className="hero-visual">
      <div className="float-chip chip1">
        <span className="dot" />
        Try-on rendered
      </div>
      <div className="float-chip chip2">
        <span className="dot" />
        94% conversion lift
      </div>
      <span className="fly-particle p1" aria-hidden />
      <span className="fly-particle p3" aria-hidden />

      <div className="showcase">
        <div className="showcase-orbit" aria-hidden />
        <div className="showcase-tilt">
          <div className="showcase-ring">
            <div className="showcase-face">
              <svg viewBox="0 0 120 120" fill="none" aria-hidden>
                <polygon
                  points="56,60 46,42.68 26,42.68 16,60 26,77.32 46,77.32"
                  stroke="url(#ig1)"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <polygon
                  points="104,60 94,42.68 74,42.68 64,60 74,77.32 94,77.32"
                  stroke="url(#ig1)"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <line x1="56" y1="60" x2="64" y2="60" stroke="url(#ig1)" strokeWidth="4" />
                <line
                  x1="16"
                  y1="60"
                  x2="2"
                  y2="50"
                  stroke="url(#ig1)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <line
                  x1="104"
                  y1="60"
                  x2="118"
                  y2="50"
                  stroke="url(#ig1)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
              <span className="face-label">Glasses</span>
            </div>
            <div className="showcase-face">
              <svg viewBox="0 0 120 120" fill="none" aria-hidden>
                <circle cx="60" cy="60" r="34" stroke="url(#ig1)" strokeWidth="4" />
                <rect x="93" y="53" width="9" height="14" rx="2" stroke="url(#ig1)" strokeWidth="3.5" />
                <line x1="60" y1="30" x2="60" y2="37" stroke="url(#ig1)" strokeWidth="3" />
                <line x1="60" y1="83" x2="60" y2="90" stroke="url(#ig1)" strokeWidth="3" />
                <line x1="30" y1="60" x2="37" y2="60" stroke="url(#ig1)" strokeWidth="3" />
                <line x1="83" y1="60" x2="90" y2="60" stroke="url(#ig1)" strokeWidth="3" />
                <line
                  x1="60"
                  y1="60"
                  x2="48"
                  y2="44"
                  stroke="url(#ig1)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <line
                  x1="60"
                  y1="60"
                  x2="74"
                  y2="42"
                  stroke="url(#ig1)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <span className="face-label">Watches</span>
            </div>
            <div className="showcase-face">
              <svg viewBox="0 0 120 120" fill="none" aria-hidden>
                <circle cx="60" cy="76" r="26" stroke="url(#ig1)" strokeWidth="8" />
                <polygon points="60,24 71,36 60,48 49,36" fill="url(#ig1)" />
              </svg>
              <span className="face-label">Jewelry</span>
            </div>
            <div className="showcase-face">
              <svg viewBox="0 0 120 120" fill="none" aria-hidden>
                <path
                  d="M40,50 Q40,28 60,28 Q80,28 80,50"
                  stroke="url(#ig1)"
                  strokeWidth="4"
                  fill="none"
                />
                <rect x="30" y="50" width="60" height="46" rx="10" stroke="url(#ig1)" strokeWidth="4" />
              </svg>
              <span className="face-label">Accessories</span>
            </div>
          </div>
        </div>
        <div className="showcase-glow" aria-hidden />
        <span className="sparkle" style={{ top: '12%', left: '18%', animationDelay: '0s' }} aria-hidden />
        <span
          className="sparkle"
          style={{ top: '80%', left: '72%', animationDelay: '2.3s' }}
          aria-hidden
        />
      </div>
    </div>
  );
}
