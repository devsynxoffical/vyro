export const DEMO_URL = '/try-on';
export const EMAIL = 'mailto:info@vyroes.tech';
export const INSTAGRAM = 'https://www.instagram.com/vyro.omn/';
export const SITE_ICON = '/brand/vyro-mark.png';

export const NAV = [
  { label: 'Challenge', path: '/challenge' },
  { label: 'Platform', path: '/platform' },
  { label: 'Experience', path: '/experience' },
  { label: 'Integrate', path: '/integrate' },
  { label: 'Pricing', path: '/pricing' },
] as const;

export const HOME_NAV = [
  { label: 'Why Vyro', hash: '#why' },
  { label: 'How it works', hash: '#how' },
  { label: 'Solutions', hash: '#solutions' },
  { label: 'FAQ', hash: '#faq' },
] as const;

export function openMeetingModal() {
  window.dispatchEvent(new CustomEvent('vyro:open-meeting'));
}
