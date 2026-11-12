import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { BASE, config_, event } from '../lib/content.js';
import { isSealed, signOut } from '../lib/session.js';

export const VARIANTS = [
  { id: 'manifest', name: 'Manifest', blurb: 'The event site, extended. A team grid and a full page per team.', icon: 'layout-grid' },
  { id: 'mission-control', name: 'Mission Control', blurb: 'A dark console. Pick a team on the left; demo in the middle; story on the right.', icon: 'monitor' },
  { id: 'launch-sequence', name: 'Launch Sequence', blurb: 'Full-screen slides for presenting in a room. Arrow keys or a clicker.', icon: 'presentation' },
  { id: 'flight-log', name: 'Flight Log', blurb: 'One long read along the joiner journey, Offer to Day 30, with every team on it.', icon: 'scroll-text' },
];

export function Brand({ to = '/', onDark = false }) {
  return (
    <Link to={to} className={`brand ${onDark ? 'brand--dark' : ''}`}>
      <img src={`${BASE}mw_launchpad.png`} width="30" height="30" alt="" />
      <span className="brand__name">LaunchPad</span>
      <span className="brand__edition">'26 · Showcase</span>
    </Link>
  );
}

export function SignOut({ onDark = false }) {
  if (!isSealed()) return null;
  return (
    <button className={`signout ${onDark ? 'signout--dark' : ''}`} onClick={signOut} title="Sign out">
      <Icon name="log-out" size={16} />
      <span>Sign out</span>
    </button>
  );
}

export function SiteHeader({ home = '/', nav = [], onDark = false }) {
  return (
    <header className={`header ${onDark ? 'header--dark' : ''}`}>
      <div className="container header__inner">
        <Brand to={home} onDark={onDark} />
        <nav className="header__nav">
          {nav.map(([to, label]) =>
            to.startsWith('#') ? (
              <a key={to} href={to}>
                {label}
              </a>
            ) : (
              <NavLink key={to} to={to} end>
                {label}
              </NavLink>
            ),
          )}
        </nav>
        <SignOut onDark={onDark} />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <img src={`${BASE}mw_launchpad.png`} alt="" />
          <div>
            <div className="footer__brand-name">LaunchPad</div>
            <div className="footer__brand-sub">{event.organiser}</div>
          </div>
        </div>
        <div className="footer__meta">
          <span>{event.edition}</span>
          <span>·</span>
          <span>{event.dates}</span>
          <span>·</span>
          <span>{event.venue}</span>
        </div>
      </div>
    </footer>
  );
}

/** Floating switcher shown while the layouts are being reviewed (config.reviewMode). */
export function VariantBar() {
  const { pathname } = useLocation();
  if (!config_.reviewMode) return null;
  const current = VARIANTS.find((v) => pathname.startsWith(`/${v.id}`));
  if (!current) return null;
  // Keep the team in view when switching between layouts that have team pages.
  const slug = pathname.match(/^\/(?:manifest|mission-control)\/([a-z0-9-]+)/)?.[1];
  const target = (v) => (slug && (v.id === 'manifest' || v.id === 'mission-control') ? `/${v.id}/${slug}` : `/${v.id}`);
  return (
    <nav className="variant-bar" aria-label="Layout options">
      <Link to="/" className="variant-bar__home" title="All layout options">
        <Icon name="layers" size={14} />
      </Link>
      {VARIANTS.map((v) => (
        <Link key={v.id} to={target(v)} className={v.id === current.id ? 'on' : ''}>
          {v.name}
        </Link>
      ))}
    </nav>
  );
}
