export function GradSvg() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="ig1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6ec7" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4f9dff" />
        </linearGradient>
        <linearGradient
          id="vyroMarkGrad"
          x1="10"
          y1="100"
          x2="110"
          y2="10"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ff2fb0" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3ec6ff" />
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff6ec7" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4f9dff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
