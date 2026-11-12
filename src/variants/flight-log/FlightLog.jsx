import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { SiteFooter, SiteHeader } from '../../components/Chrome.jsx';
import { DemoEmbed, Lightbox, ScreenStrip, VideoPlayer } from '../../components/Media.jsx';
import { AwardBadges, DomainChips, Facts, Highlights, ProblemApproach, RealVsSimulated } from '../../components/Team.jsx';
import { event, hasLive, mediaUrl, screensForStage, teamBySlug, teams } from '../../lib/content.js';
import { Md, inline } from '../../lib/md.jsx';
import { useActiveSection, useDocumentTitle, useKeys } from '../../lib/hooks.js';
import './flight-log.css';

export default function FlightLog() {
  useDocumentTitle('Flight Log');
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('team'));
  const ids = [...event.stages.map((s) => `stage-${s.id}`), 'teams'];
  const active = useActiveSection(ids);
  useEffect(() => {
    const url = new URL(window.location.href);
    open ? url.searchParams.set('team', open) : url.searchParams.delete('team');
    window.history.replaceState(null, '', url);
  }, [open]);
  const quotes = teams.filter((t) => t.quote);

  return (
    <div className="v-fl">
      <SiteHeader
        home="/flight-log"
        nav={[
          ['#stage-offer', 'The journey'],
          ['#teams', 'The teams'],
        ]}
      />
      <header className="fl-intro">
        <div className="container fl-intro__inner">
          <div className="eyebrow">
            Flight log · {event.name} {event.edition} · {event.dates}
          </div>
          <h1 className="fl-intro__title">
            From offer to Day 30, <span className="grad-text">as {teams.length} teams saw it.</span>
          </h1>
          <div className="fl-intro__cols">
            <Md text={event.brief.body} className="fl-intro__lede" />
            {event.brief.problem && <Md text={event.brief.problem} className="fl-intro__problem" />}
          </div>
          <div className="fl-intro__byline mono">
            <span>{event.venue}</span>
            <span>{event.organiser}</span>
            <span>{teams.length} teams · 6 stages · 1 brief</span>
          </div>
        </div>
      </header>

      <div className="container fl-body">
        <nav className="fl-spine" aria-label="Journey stages">
          <ol>
            {event.stages.map((s, k) => (
              <li key={s.id} className={active === `stage-${s.id}` ? 'on' : ''}>
                <a href={`#stage-${s.id}`}>
                  <span className="mono">{String(k + 1).padStart(2, '0')}</span>
                  {s.title}
                </a>
              </li>
            ))}
            <li className={active === 'teams' ? 'on' : ''}>
              <a href="#teams">
                <span className="mono">→</span>The teams
              </a>
            </li>
          </ol>
        </nav>

        <main className="fl-main">
          {event.stages.map((s, k) => {
            const covering = teams.filter((t) => t.stages.includes(s.id));
            const featured = covering.filter((t) => t.highlights.some((h) => h.stage === s.id) || screensForStage(t, s.id).length);
            const others = covering.filter((t) => !featured.includes(t));
            const q = quotes[k % Math.max(quotes.length, 1)];
            return (
              <section key={s.id} id={`stage-${s.id}`} className="fl-stage">
                <div className="fl-stage__head">
                  <span className="fl-stage__n mono">Stage {String(k + 1).padStart(2, '0')} · {s.phase}</span>
                  <h2 className="fl-stage__title">{s.title}</h2>
                  <p className="fl-stage__desc">{s.description}</p>
                  {s.who && <p className="fl-stage__who mono">Who: {s.who}</p>}
                </div>
                {featured.map((t) => (
                  <StageEntry key={t.slug} team={t} stageId={s.id} onOpen={() => setOpen(t.slug)} />
                ))}
                {others.length > 0 && (
                  <p className="fl-also">
                    Also covered by{' '}
                    {others.map((t, j) => (
                      <span key={t.slug}>
                        {j > 0 && (j === others.length - 1 ? ' and ' : ', ')}
                        <button className="fl-link" onClick={() => setOpen(t.slug)}>
                          {t.name}
                        </button>
                      </span>
                    ))}
                    .
                  </p>
                )}
                {!covering.length && <p className="fl-also">No team focused on this stage.</p>}
                {q && k % 2 === 1 && (
                  <blockquote className="fl-pull">
                    <p>“{q.quote.text}”</p>
                    <cite>
                      {q.quote.by ? `${q.quote.by}, ` : ''}
                      {q.name}
                    </cite>
                  </blockquote>
                )}
              </section>
            );
          })}

          <section id="teams" className="fl-teams">
            <div className="eyebrow">The teams</div>
            <h2 className="fl-stage__title">Everyone aboard.</h2>
            <div className="fl-index">
              {teams.map((t, k) => (
                <button key={t.slug} className="fl-index__row" onClick={() => setOpen(t.slug)}>
                  <span className="mono fl-index__n">{String(k + 1).padStart(2, '0')}</span>
                  <img src={mediaUrl(t.slug, t.media.cover)} alt="" loading="lazy" />
                  <span className="fl-index__text">
                    <strong>{t.name}</strong>
                    <em>{t.product}</em>
                    <span>{t.tagline}</span>
                  </span>
                  <span className="fl-index__go">
                    Read <Icon name="arrow-right" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
      <SiteFooter />
      {open && teamBySlug[open] && <TeamSheet team={teamBySlug[open]} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StageEntry({ team, stageId, onOpen }) {
  const hs = team.highlights.filter((h) => h.stage === stageId);
  const screens = screensForStage(team, stageId).slice(0, 2);
  const [zoom, setZoom] = useState(null);
  return (
    <article className="fl-entry">
      <div className="fl-entry__text">
        <button className="fl-entry__team" onClick={onOpen}>
          {team.name} <span>· {team.product}</span> <Icon name="arrow-right" size={14} />
        </button>
        {hs.length ? (
          hs.map((h) => (
            <div key={h.title} className="fl-entry__hl">
              <h3>{h.title}</h3>
              <p>{inline(h.body)}</p>
            </div>
          ))
        ) : (
          <p className="fl-entry__caption">{screens[0]?.caption}</p>
        )}
      </div>
      {screens.length > 0 && (
        <div className={`fl-entry__shots ${screens[0].device === 'desktop' ? 'is-desktop' : ''}`}>
          {screens.map((s, k) => (
            <button key={s.file} onClick={() => setZoom(k)} aria-label={s.caption}>
              <img src={mediaUrl(team.slug, s.file)} alt={s.caption} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {zoom !== null && <Lightbox team={team} screens={screens} index={zoom} onClose={() => setZoom(null)} onIndex={setZoom} />}
    </article>
  );
}

function TeamSheet({ team, onClose }) {
  useKeys((e) => e.key === 'Escape' && onClose(), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fl-sheet" role="dialog" aria-modal="true" aria-label={team.name} onClick={onClose}>
      <div className="fl-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <button className="fl-sheet__close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
        <div className="eyebrow">
          {team.code ? `${team.code} · ` : ''}
          {team.product}
        </div>
        <h2 className="fl-sheet__name">{team.name}</h2>
        <p className="fl-sheet__tagline">{team.tagline}</p>
        <DomainChips ids={team.domains} />
        <AwardBadges slug={team.slug} />
        <div className="fl-sheet__grid">
          <div>{hasLive(team) ? <DemoEmbed team={team} maxWidth={320} maxHeight={660} /> : <VideoPlayer team={team} maxHeight={660} />}</div>
          <div>
            <p className="fl-sheet__summary">{team.summary}</p>
            <ProblemApproach team={team} />
          </div>
        </div>
        <h3 className="fl-sheet__h">What stands out</h3>
        <Highlights team={team} />
        <h3 className="fl-sheet__h">Screens</h3>
        <ScreenStrip team={team} />
        <div className="fl-sheet__grid fl-sheet__grid--even">
          <div>
            <h3 className="fl-sheet__h">Real and simulated</h3>
            <RealVsSimulated team={team} />
          </div>
          <div>
            <h3 className="fl-sheet__h">Facts</h3>
            <Facts team={team} />
          </div>
        </div>
      </div>
    </div>
  );
}
