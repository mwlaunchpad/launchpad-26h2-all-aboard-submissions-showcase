import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { SiteFooter, SignOut, Brand, VARIANTS } from '../../components/Chrome.jsx';
import { event, teams } from '../../lib/content.js';
import { useDocumentTitle } from '../../lib/hooks.js';

// Small CSS-drawn previews of each layout, so the picker needs no screenshots of itself.
function Thumb({ id }) {
  if (id === 'manifest')
    return (
      <div className="thumb thumb--manifest">
        <div className="t-hero" />
        <div className="t-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    );
  if (id === 'mission-control')
    return (
      <div className="thumb thumb--mc">
        <div className="t-rail">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className={i === 2 ? 'on' : ''} />
          ))}
        </div>
        <div className="t-stage">
          <span className="t-phone" />
        </div>
        <div className="t-panel">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  if (id === 'launch-sequence')
    return (
      <div className="thumb thumb--ls">
        <div className="t-slide">
          <span className="t-title" />
          <span className="t-phone" />
        </div>
        <div className="t-progress">
          <span />
        </div>
      </div>
    );
  return (
    <div className="thumb thumb--fl">
      <div className="t-spine">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="t-col">
        <span className="t-line" />
        <span className="t-line short" />
        <span className="t-row">
          <i />
          <i />
        </span>
        <span className="t-line" />
      </div>
    </div>
  );
}

export default function Picker() {
  useDocumentTitle('Choose a view');
  return (
    <>
      <header className="header">
        <div className="container header__inner">
          <Brand />
          <div style={{ marginLeft: 'auto' }}>
            <SignOut />
          </div>
        </div>
      </header>
      <section className="page-hero">
        <div className="container">
          <div className="eyebrow">
            {event.name} · {event.edition}
          </div>
          <h1 className="page-hero__title">
            {teams.length} teams. <span className="grad-text">Four ways in.</span>
          </h1>
          <p className="page-hero__lede">
            The same teams, screenshots and live demos in four views, each suited to a different audience. Pick the one
            that fits; the bar at the bottom of every page switches between them.
          </p>
        </div>
      </section>
      <section className="section section--paper picker">
        <div className="container picker__grid">
          {VARIANTS.map((v) => (
            <Link key={v.id} to={`/${v.id}`} className="picker__card">
              <Thumb id={v.id} />
              <div className="picker__body">
                <div className="picker__eyebrow mono">Best for · {v.audience}</div>
                <h2 className="picker__name">
                  <Icon name={v.icon} size={22} /> {v.name}
                </h2>
                <p>{v.blurb}</p>
                <span className="picker__go">
                  Open <Icon name="arrow-right" size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
