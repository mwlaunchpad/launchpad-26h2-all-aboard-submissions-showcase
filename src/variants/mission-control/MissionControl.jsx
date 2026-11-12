import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Brand, SignOut } from '../../components/Chrome.jsx';
import { DeviceFrame } from '../../components/Frames.jsx';
import { DeckStrip, DemoEmbed, DemoNotes, Lightbox, VideoPlayer } from '../../components/Media.jsx';
import { AwardBadges, DomainChips, Facts, Highlights, ProblemApproach, Quote, RealVsSimulated, StageDots } from '../../components/Team.jsx';
import { event, hasLive, hasVideo, mediaUrl, neighbours, teamBySlug, teams } from '../../lib/content.js';
import { useDocumentTitle, useKeys } from '../../lib/hooks.js';
import './mission-control.css';

export default function MissionControl() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const team = teamBySlug[slug ?? teams[0].slug];
  useDocumentTitle(team ? `${team.name} · Mission Control` : 'Mission Control');

  const modes = team ? [hasLive(team) && 'live', hasVideo(team) && 'video', 'screens'].filter(Boolean) : [];
  const [mode, setMode] = useState(modes[0]);
  const [tab, setTab] = useState('story');
  useEffect(() => {
    setMode(modes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.slug]);

  useKeys((e) => {
    if (!team) return;
    const { prev, next } = neighbours(team.slug);
    if (e.key === 'ArrowDown' || e.key === 'j') (e.preventDefault(), navigate(`/mission-control/${next.slug}`));
    if (e.key === 'ArrowUp' || e.key === 'k') (e.preventDefault(), navigate(`/mission-control/${prev.slug}`));
    const n = Number(e.key);
    if (n >= 1 && n <= modes.length) setMode(modes[n - 1]);
  }, [team?.slug, modes.join()]);

  if (!team) return <Navigate to="/mission-control" replace />;
  const tabs = [
    ['story', 'Story'],
    ['highlights', 'Highlights'],
    ['facts', 'Facts'],
    ...(team.media.deck ? [['pitch', 'Pitch']] : []),
  ];

  return (
    <div className="v-mc">
      <header className="mc-top">
        <Brand to="/mission-control" onDark />
        <div className="mc-top__title mono">
          <span className="mc-live-dot" /> Mission control · {event.edition} · {teams.length} teams
        </div>
        <div className="mc-top__keys mono" aria-hidden="true">
          <kbd>↑</kbd>
          <kbd>↓</kbd> team <kbd>1</kbd>–<kbd>{modes.length}</kbd> view
        </div>
        <SignOut onDark />
      </header>

      <div className="mc-body">
        <nav className="mc-rail" aria-label="Teams">
          {teams.map((t, i) => (
            <Link key={t.slug} to={`/mission-control/${t.slug}`} className={`mc-rail__item ${t.slug === team.slug ? 'on' : ''}`} aria-current={t.slug === team.slug ? 'page' : undefined}>
              <span className="mc-rail__n mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="mc-rail__text">
                <span className="mc-rail__name">{t.name}</span>
                <span className="mc-rail__product">{t.product}</span>
              </span>
              <span className={`mc-rail__status ${hasLive(t) ? 'is-live' : ''}`} title={hasLive(t) ? 'Live demo' : 'Walkthrough'} />
            </Link>
          ))}
        </nav>

        <main className="mc-stage">
          <div className="mc-stage__head">
            <div>
              <div className="mc-eyebrow mono">
                {team.code ? `${team.code} · ` : ''}
                {team.product}
              </div>
              <h1 className="mc-name">{team.name}</h1>
            </div>
            <div className="seg seg--dark" role="tablist" aria-label="View">
              {modes.map((m, k) => (
                <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                  <Icon name={m === 'live' ? 'play' : m === 'video' ? 'video' : 'image'} size={14} />
                  {m === 'live' ? 'Live demo' : m === 'video' ? 'Walkthrough' : 'Screens'}
                  <span className="mono seg__key">{k + 1}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mc-stage__device">
            {mode === 'live' && <DemoEmbed team={team} autoLoad tone="dark" maxHeight={720} showNotes={false} />}
            {mode === 'video' && <VideoPlayer team={team} tone="dark" maxHeight={720} />}
            {mode === 'screens' && <ScreenCarousel team={team} />}
          </div>
          {mode === 'live' && <DemoNotes team={team} compact />}
        </main>

        <aside className="mc-panel">
          <p className="mc-tagline">{team.tagline}</p>
          <DomainChips ids={team.domains} onDark />
          <div className="mc-stages">
            <span className="mono">Journey coverage</span>
            <StageDots ids={team.stages} />
          </div>
          <AwardBadges slug={team.slug} />
          <div className="mc-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mc-panel__body">
            {tab === 'story' && (
              <>
                <p className="mc-summary">{team.summary}</p>
                <ProblemApproach team={team} onDark />
                <Quote team={team} onDark />
              </>
            )}
            {tab === 'highlights' && <Highlights team={team} onDark columns={1} />}
            {tab === 'facts' && (
              <>
                <Facts team={team} onDark />
                <RealVsSimulated team={team} onDark />
              </>
            )}
            {tab === 'pitch' && <DeckStrip team={team} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScreenCarousel({ team }) {
  const screens = team.media.screens;
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => setI(0), [team.slug]);
  const s = screens[Math.min(i, screens.length - 1)];
  const go = (d) => setI((i + d + screens.length) % screens.length);
  useKeys((e) => {
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  }, [i, team.slug]);
  return (
    <div className="mc-carousel">
      <div className="mc-carousel__main">
        <button className="mc-carousel__nav" onClick={() => go(-1)} aria-label="Previous screen">
          <Icon name="chevron-left" size={24} />
        </button>
        <button className="mc-carousel__shot" onClick={() => setZoom(true)} aria-label="Enlarge">
          <DeviceFrame device={s.device} image={mediaUrl(team.slug, s.file)} alt={s.caption} maxWidth={s.device === 'desktop' ? 760 : 340} maxHeight={620} tone="dark" />
        </button>
        <button className="mc-carousel__nav" onClick={() => go(1)} aria-label="Next screen">
          <Icon name="chevron-right" size={24} />
        </button>
      </div>
      <p className="mc-carousel__cap">
        <span className="mono">
          {String(i + 1).padStart(2, '0')}/{String(screens.length).padStart(2, '0')}
        </span>{' '}
        {s.caption}
      </p>
      <div className="mc-carousel__thumbs">
        {screens.map((x, k) => (
          <button key={x.file} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={x.caption}>
            <img src={mediaUrl(team.slug, x.file)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {zoom && <Lightbox team={team} screens={screens} index={i} onClose={() => setZoom(false)} onIndex={setI} />}
    </div>
  );
}
