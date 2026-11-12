import { useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { SiteFooter, SiteHeader } from '../../components/Chrome.jsx';
import { DeckStrip, DemoEmbed, ScreenStrip, VideoPlayer } from '../../components/Media.jsx';
import {
  AwardBadges,
  DemoKind,
  DomainChips,
  Facts,
  Highlights,
  ProblemApproach,
  Quote,
  RealVsSimulated,
  TeamCard,
} from '../../components/Team.jsx';
import { event, hasLive, hasVideo, neighbours, results, teamBySlug, teams } from '../../lib/content.js';
import { Md } from '../../lib/md.jsx';
import { useDocumentTitle } from '../../lib/hooks.js';
import './manifest.css';

const NAV = [
  ['#brief', 'The brief'],
  ['#teams', 'Teams'],
  ['#judging', 'Judging'],
];

export default function Manifest() {
  return (
    <div className="v-manifest">
      <Routes>
        <Route index element={<Home />} />
        <Route path=":slug" element={<TeamPage />} />
      </Routes>
      <SiteFooter />
    </div>
  );
}

function Home() {
  useDocumentTitle('Manifest');
  const [filter, setFilter] = useState('all');
  const shown = filter === 'all' ? teams : teams.filter((t) => t.domains.includes(filter));
  return (
    <>
      <SiteHeader home="/manifest" nav={NAV} />
      <section className="hero">
        <svg className="hero__art" viewBox="0 0 400 400" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="1">
            {Array.from({ length: 8 }).map((_, i) => (
              <circle key={i} cx="200" cy="200" r={40 + i * 22} />
            ))}
          </g>
        </svg>
        <div className="container m-hero">
          <div className="hero__eyebrow">
            <span className="pulse" />
            {event.name} · {event.edition} · {event.nickname ?? 'Showcase'}
          </div>
          <h1 className="hero__title">
            {teams.length} teams. One brief. <em>All aboard.</em>
          </h1>
          <p className="hero__sub">
            What Modern Workplace engineers built in two days in Leeds: companions that take a new joiner from offer to Day 30.
            Every team has screenshots and a walkthrough video, and {teams.filter(hasLive).length} of the {teams.length} have an interactive demo you can click through.
          </p>
          <div className="hero__ctas">
            <a href="#teams" className="btn btn--primary">
              Meet the teams →
            </a>
            <a href="#brief" className="btn btn--secondary">
              Read the brief
            </a>
          </div>
          {event.stats?.length > 0 && (
            <div className="hero__facts">
              {event.stats.slice(0, 4).map((s) => (
                <div key={s.label} className="hero__fact">
                  <div className="num">{s.value}</div>
                  <div className="lab">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="brief" className="section section--sand">
        <div className="container">
          <div className="section__head">
            <div>
              <div className="eyebrow">{event.brief.eyebrow ?? 'The brief'}</div>
              <h2 className="section__title">
                {event.brief.headline} <span className="grad-text">{event.brief.accent}</span>
              </h2>
            </div>
            <Md text={event.brief.body} className="section__lede" />
          </div>
          {event.brief.problem && (
            <div className="callout m-callout">
              <div className="callout__flag">
                <Icon name="flag" size={14} /> The problem
              </div>
              <Md text={event.brief.problem} className="callout__body" />
            </div>
          )}
          <div className="m-domains">
            {event.domains.map((d) => (
              <div key={d.id} className="prompt-card">
                <span className="icon-tile icon-tile--sm">
                  <Icon name={d.icon ?? 'flag'} size={18} />
                </span>
                <div className="prompt-card__title">{d.title}</div>
                <ul className="m-prompts">
                  {d.prompts.map((p) => (
                    <li key={p.title}>{p.title}</li>
                  ))}
                </ul>
                <div className="m-domain-teams">
                  {teams.filter((t) => t.domains.includes(d.id)).length} teams took this on
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="teams" className="section section--paper">
        <div className="container">
          <div className="section__head">
            <div>
              <div className="eyebrow">Manifest · {event.edition}</div>
              <h2 className="section__title">
                The teams <span className="grad-text">and what they shipped.</span>
              </h2>
            </div>
            <p className="section__lede">Filter by the part of the brief each team went after. Open a team for its demo, screens and story.</p>
          </div>
          <div className="m-filter" role="tablist" aria-label="Filter by challenge area">
            <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              All teams <span className="mono">{teams.length}</span>
            </button>
            {event.domains.map((d) => (
              <button key={d.id} role="tab" aria-selected={filter === d.id} className={filter === d.id ? 'on' : ''} onClick={() => setFilter(d.id)}>
                {d.title} <span className="mono">{teams.filter((t) => t.domains.includes(d.id)).length}</span>
              </button>
            ))}
          </div>
          <div className="m-grid">
            {shown.map((t) => (
              <TeamCard key={t.slug} team={t} to={`/manifest/${t.slug}`} />
            ))}
          </div>
        </div>
      </section>

      {results.published && <Results />}

      <section id="judging" className="section section--sand">
        <div className="container">
          <div className="section__head">
            <div>
              <div className="eyebrow">Judging · How it was scored</div>
              <h2 className="section__title">
                Five categories. <span className="grad-text">One Best in Show.</span>
              </h2>
            </div>
            <Md text={event.judging.summary} className="section__lede" />
          </div>
          <div className="cats">
            {event.judging.categories.map((c, i) => (
              <div key={c.id} className="cat">
                <span className="icon-tile">
                  <Icon name={c.icon ?? 'award'} size={20} />
                </span>
                <div className="cat__num">{String(i + 1).padStart(2, '0')}</div>
                <div className="cat__title">{c.title}</div>
                <div className="cat__desc">{c.body}</div>
              </div>
            ))}
            <div className="cat cat--best">
              <span className="icon-tile">
                <Icon name="trophy" size={20} />
              </span>
              <div className="cat__num">★</div>
              <div className="cat__title">Best in Show</div>
              <Md text={event.judging.bestInShow} className="cat__desc" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Results() {
  const best = results.bestInShow && teamBySlug[results.bestInShow];
  return (
    <section id="results" className="section section--paper">
      <div className="container">
        <div className="section__head">
          <div>
            <div className="eyebrow">Results · {event.dates}</div>
            <h2 className="section__title">
              And the awards <span className="grad-text">went to.</span>
            </h2>
          </div>
        </div>
        {best && (
          <Link to={`/manifest/${best.slug}`} className="m-best">
            <Icon name="trophy" size={28} />
            <div>
              <div className="eyebrow">Best in Show</div>
              <div className="m-best__name">{best.name}</div>
              <div className="m-best__product">{best.product}</div>
              {results.bestInShowCitation && <p>{results.bestInShowCitation}</p>}
            </div>
          </Link>
        )}
        <div className="m-awards">
          {results.categories
            .filter((c) => c.winner)
            .map((c) => (
              <Link key={c.id} to={`/manifest/${c.winner}`} className="m-award">
                <div className="eyebrow">{c.title}</div>
                <div className="m-award__team">{teamBySlug[c.winner].name}</div>
                {c.citation && <p>{c.citation}</p>}
              </Link>
            ))}
        </div>
      </div>
    </section>
  );
}

function TeamPage() {
  const { slug } = useParams();
  const team = teamBySlug[slug];
  useDocumentTitle(team?.name);
  if (!team) return <Navigate to="/manifest" replace />;
  const { prev, next, index } = neighbours(slug);
  return (
    <>
      <SiteHeader home="/manifest" nav={[['/manifest', 'All teams']]} />
      <section className="page-hero m-team-hero">
        <div className="container">
          <Link to="/manifest#teams" className="m-back">
            <Icon name="arrow-left" size={14} /> All teams
          </Link>
          <div className="eyebrow">
            Team {String(index + 1).padStart(2, '0')} of {String(teams.length).padStart(2, '0')}
            {team.code ? ` · ${team.code}` : ''} · {team.product}
          </div>
          <h1 className="page-hero__title">{team.name}</h1>
          <p className="page-hero__lede">{team.tagline}</p>
          <div className="m-team-meta">
            <DomainChips ids={team.domains} />
            <DemoKind team={team} />
          </div>
          <AwardBadges slug={team.slug} />
        </div>
      </section>

      <section className="section section--paper m-team-main">
        <div className="container m-team-grid">
          <div className="m-team-device">
            {hasLive(team) ? <DemoEmbed team={team} /> : <VideoPlayer team={team} />}
          </div>
          <div className="m-team-story">
            <p className="m-summary">{team.summary}</p>
            <ProblemApproach team={team} />
            <Quote team={team} />
            <h3 className="m-h3">What stands out</h3>
            <Highlights team={team} columns={1} />
          </div>
        </div>
      </section>

      <section className="section section--sand">
        <div className="container">
          <div className="section__head">
            <div>
              <div className="eyebrow">Screens · {team.media.screens.length}</div>
              <h2 className="section__title">
                Walk through <span className="grad-text">the product.</span>
              </h2>
            </div>
            <p className="section__lede">Captured from the archived build. Select any screen to enlarge it; use the arrow keys to step through.</p>
          </div>
          <ScreenStrip team={team} />
        </div>
      </section>

      {hasLive(team) && hasVideo(team) && (
        <section className="section section--paper">
          <div className="container m-video-row">
            <div>
              <div className="eyebrow">Walkthrough video</div>
              <h2 className="section__title">
                See it <span className="grad-text">in motion.</span>
              </h2>
              <p className="section__lede">{team.media.videoCaption ?? 'A recorded run through the main journey.'}</p>
            </div>
            <VideoPlayer team={team} />
          </div>
        </section>
      )}

      <section className="section section--paper m-detail">
        <div className="container m-detail-grid">
          <div>
            <h3 className="m-h3">What is real, and what is simulated</h3>
            <RealVsSimulated team={team} />
            {team.media.deck && (
              <>
                <h3 className="m-h3">Their pitch</h3>
                <DeckStrip team={team} />
              </>
            )}
          </div>
          <div>
            <h3 className="m-h3">Facts</h3>
            <Facts team={team} />
          </div>
        </div>
      </section>

      <nav className="m-pager container" aria-label="More teams">
        <Link to={`/manifest/${prev.slug}`} className="m-pager__link">
          <Icon name="arrow-left" size={16} />
          <span>
            <span className="eyebrow">Previous</span>
            {prev.name}
          </span>
        </Link>
        <Link to={`/manifest/${next.slug}`} className="m-pager__link m-pager__link--next">
          <span>
            <span className="eyebrow">Next</span>
            {next.name}
          </span>
          <Icon name="arrow-right" size={16} />
        </Link>
      </nav>
    </>
  );
}
