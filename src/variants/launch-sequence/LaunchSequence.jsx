import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { DeviceFrame } from '../../components/Frames.jsx';
import { BASE, demoUrl, event, hasLive, mediaUrl, results, stageById, teamBySlug, teams } from '../../lib/content.js';
import { Md, inline } from '../../lib/md.jsx';
import { useDocumentTitle, useKeys } from '../../lib/hooks.js';
import { isSealed, signOut } from '../../lib/session.js';
import './launch-sequence.css';

const W = 1600;
const H = 900;

function buildSlides() {
  const s = [
    { id: 'title', section: 'Intro', render: (p) => <TitleSlide {...p} /> },
    { id: 'brief', section: 'Intro', render: () => <BriefSlide /> },
    { id: 'domains', section: 'Intro', render: () => <DomainsSlide /> },
    { id: 'journey', section: 'Intro', render: () => <JourneySlide /> },
    { id: 'manifest', section: 'Intro', render: () => <ManifestSlide /> },
  ];
  teams.forEach((t, i) => {
    s.push({ id: `${t.slug}`, team: t, section: t.name, render: () => <TeamIntro team={t} n={i + 1} /> });
    s.push({ id: `${t.slug}/story`, team: t, section: t.name, render: () => <TeamStory team={t} /> });
    s.push({ id: `${t.slug}/demo`, team: t, section: t.name, render: (p) => <TeamDemo team={t} {...p} /> });
    s.push({ id: `${t.slug}/screens`, team: t, section: t.name, render: () => <TeamScreens team={t} /> });
  });
  if (results.published) s.push({ id: 'results', section: 'Finale', render: () => <ResultsSlide /> });
  s.push({ id: 'thanks', section: 'Finale', render: () => <ThanksSlide /> });
  return s;
}

const indexFromHash = (slides) => {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  if (!h) return 0;
  const n = Number(h);
  if (Number.isInteger(n) && n >= 1 && n <= slides.length) return n - 1;
  const k = slides.findIndex((s) => s.id === h);
  return k >= 0 ? k : 0;
};

export default function LaunchSequence() {
  useDocumentTitle('Launch Sequence');
  const slides = useMemo(buildSlides, []);
  const [i, setI] = useState(() => indexFromHash(slides));
  const [overview, setOverview] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, (window.innerHeight - 44) / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    const target = `#/${slides[i].id}`;
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [i, slides]);
  useEffect(() => {
    const onHash = () => setI(indexFromHash(slides));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [slides]);

  const go = (k) => setI(Math.max(0, Math.min(slides.length - 1, k)));
  useKeys((e) => {
    if (overview) {
      if (e.key === 'Escape' || e.key === 'o') setOverview(false);
      return;
    }
    if (['ArrowRight', 'PageDown', ' ', 'Enter', 'l'].includes(e.key)) (e.preventDefault(), go(i + 1));
    else if (['ArrowLeft', 'PageUp', 'Backspace', 'h'].includes(e.key)) (e.preventDefault(), go(i - 1));
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 'o' || e.key === 'Escape') setOverview(true);
    else if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  }, [i, overview]);

  const sections = [...new Set(slides.map((s) => s.section))];
  const cur = slides[i];
  return (
    <div className="v-ls">
      <div className="ls-viewport" onClick={(e) => e.target === e.currentTarget && go(i + 1)}>
        <div className="ls-stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
          <div className={`ls-slide ls-slide--${cur.id.split('/')[1] ?? (cur.team ? 'intro' : cur.id)}`} key={cur.id}>
            {cur.render({ active: true })}
          </div>
        </div>
      </div>

      <footer className="ls-bar">
        <Link to="/" className="ls-bar__home" title="Exit">
          <img src={`${BASE}mw_launchpad.png`} alt="" width="20" height="20" />
        </Link>
        <div className="ls-progress" aria-hidden="true">
          {sections.map((sec) => {
            const idx = slides.map((s, k) => (s.section === sec ? k : -1)).filter((k) => k >= 0);
            const done = idx.filter((k) => k <= i).length / idx.length;
            return (
              <button key={sec} className="ls-progress__seg" onClick={() => go(idx[0])} title={sec} style={{ flex: idx.length }}>
                <span style={{ width: `${done * 100}%` }} />
              </button>
            );
          })}
        </div>
        <span className="ls-bar__label mono">
          {cur.section} · {i + 1}/{slides.length}
        </span>
        <button className="ls-bar__btn" onClick={() => go(i - 1)} aria-label="Previous slide">
          <Icon name="chevron-left" size={18} />
        </button>
        <button className="ls-bar__btn" onClick={() => go(i + 1)} aria-label="Next slide">
          <Icon name="chevron-right" size={18} />
        </button>
        <button className="ls-bar__btn" onClick={() => setOverview(true)} aria-label="Overview (O)">
          <Icon name="layout-grid" size={16} />
        </button>
        <button className="ls-bar__btn" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Full screen (F)">
          <Icon name="maximize" size={16} />
        </button>
        {isSealed() && (
          <button className="ls-bar__btn" onClick={signOut} aria-label="Sign out">
            <Icon name="log-out" size={16} />
          </button>
        )}
      </footer>

      {overview && (
        <div className="ls-overview" role="dialog" aria-label="All slides">
          <div className="ls-overview__head">
            <span className="mono">All slides · Esc to close</span>
            <button onClick={() => setOverview(false)} aria-label="Close">
              <Icon name="x" size={20} />
            </button>
          </div>
          <div className="ls-overview__grid">
            {slides.map((s, k) => (
              <button
                key={s.id}
                className={`ls-thumb ${k === i ? 'on' : ''}`}
                onClick={() => {
                  go(k);
                  setOverview(false);
                }}
              >
                <div className="ls-thumb__stage" style={{ width: W, height: H }}>
                  <div className={`ls-slide ls-slide--${s.id.split('/')[1] ?? (s.team ? 'intro' : s.id)}`}>{s.render({ active: false })}</div>
                </div>
                <span className="mono">
                  {k + 1}. {s.section}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- slides */

function TitleSlide({ active }) {
  const [t, setT] = useState(active ? 3 : 0);
  useEffect(() => {
    if (!active || t <= 0) return;
    const id = setTimeout(() => setT(t - 1), 700);
    return () => clearTimeout(id);
  }, [t, active]);
  return (
    <div className="ls-title">
      <svg className="ls-rings" viewBox="0 0 400 400" fill="none" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, k) => (
          <circle key={k} cx="200" cy="200" r={30 + k * 21} stroke="currentColor" />
        ))}
      </svg>
      <div className="ls-kicker mono">
        <span className="pulse" /> {event.name} · {event.edition} · {event.nickname ?? 'Showcase'}
      </div>
      {t > 0 ? (
        <div className="ls-countdown mono" key={t}>
          T-{t}
        </div>
      ) : (
        <h1 className="ls-title__h">
          {teams.length} teams.
          <br />
          One brief.
          <br />
          <em>All aboard.</em>
        </h1>
      )}
      <div className="ls-title__meta mono">
        {event.dates} · {event.venue} · {event.organiser}
      </div>
    </div>
  );
}

function BriefSlide() {
  return (
    <div className="ls-pad ls-brief">
      <div className="eyebrow">{event.brief.eyebrow ?? 'The brief'}</div>
      <h2 className="ls-h2">
        {event.brief.headline} <span className="grad-text">{event.brief.accent}</span>
      </h2>
      <Md text={event.brief.body} className="ls-lede" />
      {event.brief.problem && (
        <div className="ls-callout">
          <Icon name="flag" size={22} />
          <Md text={event.brief.problem} />
        </div>
      )}
    </div>
  );
}

function DomainsSlide() {
  return (
    <div className="ls-pad">
      <div className="eyebrow">Four challenge areas</div>
      <h2 className="ls-h2">
        Where teams <span className="grad-text">could aim.</span>
      </h2>
      <div className="ls-domains">
        {event.domains.map((d) => (
          <div key={d.id} className="ls-card">
            <span className="icon-tile">
              <Icon name={d.icon ?? 'flag'} size={22} />
            </span>
            <h3>{d.title}</h3>
            <ul>
              {d.prompts.slice(0, 3).map((p) => (
                <li key={p.title}>{p.title}</li>
              ))}
            </ul>
            <div className="ls-card__foot mono">{teams.filter((t) => t.domains.includes(d.id)).length} teams</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JourneySlide() {
  return (
    <div className="ls-pad">
      <div className="eyebrow">The reference journey</div>
      <h2 className="ls-h2">
        Offer to Day 30, <span className="grad-text">in six stages.</span>
      </h2>
      <ol className="ls-journey">
        {event.stages.map((s, k) => (
          <li key={s.id}>
            <span className="ls-journey__n mono">{String(k + 1).padStart(2, '0')}</span>
            <span className="ls-journey__phase mono">{s.phase}</span>
            <strong>{s.title}</strong>
            <p>{s.description}</p>
            <span className="ls-journey__teams mono">{teams.filter((t) => t.stages.includes(s.id)).length} teams</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ManifestSlide() {
  return (
    <div className="ls-pad">
      <div className="eyebrow">Manifest · {event.edition}</div>
      <h2 className="ls-h2">
        Tonight's <span className="grad-text">line-up.</span>
      </h2>
      <div className="ls-manifest">
        {teams.map((t, k) => (
          <a key={t.slug} href={`#/${t.slug}`} className="ls-manifest__item">
            <img src={mediaUrl(t.slug, t.media.cover)} alt="" />
            <span className="mono">{String(k + 1).padStart(2, '0')}</span>
            <strong>{t.name}</strong>
            <em>{t.product}</em>
          </a>
        ))}
      </div>
    </div>
  );
}

function TeamIntro({ team, n }) {
  const cover = team.media.screens.find((s) => s.file === team.media.cover);
  return (
    <div className="ls-team-intro">
      <div className="ls-team-intro__text">
        <div className="ls-kicker mono">
          Team {String(n).padStart(2, '0')} of {String(teams.length).padStart(2, '0')}
          {team.code ? ` · ${team.code}` : ''}
        </div>
        <h2 className="ls-team-name">{team.name}</h2>
        <div className="ls-product">{team.product}</div>
        <p className="ls-tagline">{team.tagline}</p>
      </div>
      <DeviceFrame device={cover?.device ?? 'phone'} image={mediaUrl(team.slug, team.media.cover)} maxWidth={cover?.device === 'desktop' ? 760 : 360} maxHeight={760} tone="dark" />
    </div>
  );
}

function TeamStory({ team }) {
  return (
    <div className="ls-pad ls-story">
      <div className="eyebrow">{team.name} · The thinking</div>
      <div className="ls-pa">
        <div>
          <h3>The problem they saw</h3>
          <Md text={team.problem} />
        </div>
        <div className="ls-pa__arrow">
          <Icon name="arrow-right" size={36} />
        </div>
        <div>
          <h3>What they built</h3>
          <Md text={team.approach} />
        </div>
      </div>
      <div className="ls-story__foot">
        {team.quote ? (
          <blockquote>
            “{team.quote.text}”{team.quote.by && <cite> {team.quote.by}</cite>}
          </blockquote>
        ) : (
          <p className="ls-summary">{team.summary}</p>
        )}
      </div>
    </div>
  );
}

function TeamDemo({ team, active }) {
  const live = hasLive(team);
  const entry = team.demo.entries[0];
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setLoad(true), 350);
    return () => clearTimeout(id);
  }, [active]);
  return (
    <div className="ls-pad ls-demo">
      <div className="ls-demo__text">
        <div className="eyebrow">{team.name} · {live ? 'Interactive demo' : 'Walkthrough video'}</div>
        <h2 className="ls-h2 ls-h2--sm">What stands out</h2>
        <ol className="ls-hl">
          {team.highlights.slice(0, 5).map((h) => (
            <li key={h.title}>
              <strong>{h.title}</strong>
              <span>{inline(h.body)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="ls-demo__device">
        {live ? (
          <DeviceFrame device={entry.device} maxWidth={entry.device === 'desktop' ? 900 : 380} maxHeight={800} tone="dark">
            {active && load ? <iframe src={demoUrl(entry.path)} title={team.name} /> : <img src={mediaUrl(team.slug, team.media.cover)} alt="" />}
          </DeviceFrame>
        ) : team.media.video ? (
          <DeviceFrame device="phone" maxWidth={380} maxHeight={800} tone="dark">
            {active ? <video src={mediaUrl(team.slug, team.media.video)} poster={mediaUrl(team.slug, team.media.poster) ?? undefined} controls playsInline preload="metadata" /> : <img src={mediaUrl(team.slug, team.media.poster ?? team.media.cover)} alt="" />}
          </DeviceFrame>
        ) : (
          <DeviceFrame device="phone" image={mediaUrl(team.slug, team.media.cover)} maxWidth={380} maxHeight={800} tone="dark" />
        )}
      </div>
    </div>
  );
}

function pickScreens(team, n = 4) {
  const picked = [];
  const seen = new Set();
  for (const s of team.media.screens) {
    const key = s.stage ?? s.role ?? s.file;
    if (!seen.has(key) && s.file !== team.media.cover) {
      picked.push(s);
      seen.add(key);
    }
    if (picked.length === n) break;
  }
  for (const s of team.media.screens) if (picked.length < n && !picked.includes(s)) picked.push(s);
  return picked;
}

function TeamScreens({ team }) {
  const phones = team.media.screens.filter((s) => s.device === 'phone');
  const desktop = phones.length < 3;
  const screens = desktop ? pickScreens(team, 2) : pickScreens({ ...team, media: { ...team.media, screens: phones } }, 4);
  return (
    <div className="ls-pad ls-screens">
      <div className="eyebrow">{team.name} · Screens</div>
      <div className={`ls-screens__row ${desktop ? 'is-desktop' : ''}`}>
        {screens.map((s) => (
          <figure key={s.file}>
            <img src={mediaUrl(team.slug, s.file)} alt={s.caption} />
            <figcaption>
              {s.stage && stageById[s.stage] && <span className="mono">{stageById[s.stage].title}</span>}
              {s.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function ResultsSlide() {
  const best = results.bestInShow && teamBySlug[results.bestInShow];
  return (
    <div className="ls-pad ls-results">
      <div className="eyebrow">Results</div>
      <h2 className="ls-h2">
        And the awards <span className="grad-text">went to.</span>
      </h2>
      {best && (
        <div className="ls-best">
          <Icon name="trophy" size={44} />
          <div>
            <div className="mono">Best in Show</div>
            <strong>{best.name}</strong>
            <span>{best.product}</span>
          </div>
        </div>
      )}
      <div className="ls-awards">
        {results.categories
          .filter((c) => c.winner)
          .map((c) => (
            <div key={c.id}>
              <span className="mono">{c.title}</span>
              <strong>{teamBySlug[c.winner].name}</strong>
            </div>
          ))}
      </div>
    </div>
  );
}

function ThanksSlide() {
  return (
    <div className="ls-title ls-thanks">
      <div className="ls-kicker mono">{event.name} · {event.edition}</div>
      <h1 className="ls-title__h">
        Thank you, <em>everyone aboard.</em>
      </h1>
      <div className="ls-thanks__teams">
        {teams.map((t) => (
          <span key={t.slug}>{t.name}</span>
        ))}
      </div>
      <div className="ls-title__meta mono">{event.organiser}</div>
    </div>
  );
}
