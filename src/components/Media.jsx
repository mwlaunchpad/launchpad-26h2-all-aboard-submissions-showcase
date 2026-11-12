import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { DeviceFrame } from './Frames.jsx';
import { demoUrl, hasLive, mediaUrl } from '../lib/content.js';
import { useKeys } from '../lib/hooks.js';

/** Interactive demo (the team's app, running in the browser) in a device frame. Loads only when asked, so pages with many teams stay light. */
export function DemoEmbed({ team, maxWidth = 360, maxHeight = 760, autoLoad = false, tone = 'light', showNotes = true }) {
  const entries = team.demo.entries;
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(autoLoad);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setI(0);
    setLoaded(autoLoad);
  }, [team.slug, autoLoad]);
  if (!hasLive(team)) return null;
  const entry = entries[Math.min(i, entries.length - 1)];
  const cover = mediaUrl(team.slug, team.media.cover);
  return (
    <div className={`demo demo--${tone}`}>
      {entries.length > 1 && (
        <div className="seg" role="tablist" aria-label="Demo entry points">
          {entries.map((e, k) => (
            <button key={e.path} role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}>
              {e.label}
            </button>
          ))}
        </div>
      )}
      <DeviceFrame device={entry.device} maxWidth={entry.device === 'desktop' ? maxWidth * 2.4 : maxWidth} maxHeight={maxHeight} tone={tone}>
        {loaded ? (
          <iframe key={`${entry.path}-${nonce}`} src={demoUrl(entry.path)} title={`${team.name}: ${entry.label}`} allow="camera; clipboard-write" />
        ) : (
          <button className="demo__launch" onClick={() => setLoaded(true)} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
            <span className="demo__launch-pill">
              <Icon name="smartphone" size={16} /> Try the interactive demo
            </span>
          </button>
        )}
      </DeviceFrame>
      <div className="demo__bar">
        {loaded && (
          <button className="link-btn" onClick={() => setNonce((n) => n + 1)}>
            <Icon name="history" size={14} /> Restart
          </button>
        )}
        <a className="link-btn" href={demoUrl(entry.path)} target="_blank" rel="noreferrer">
          <Icon name="maximize" size={14} /> Open full screen
        </a>
      </div>
      {showNotes && <DemoNotes team={team} />}
    </div>
  );
}

export function DemoNotes({ team, compact = false }) {
  const { howTo, limitations } = team.demo;
  if (!howTo.length && !limitations.length) return null;
  return (
    <div className={`demo-notes ${compact ? 'demo-notes--compact' : ''}`}>
      {howTo.length > 0 && (
        <div>
          <div className="demo-notes__k">
            <Icon name="lightbulb" size={14} /> Try this
          </div>
          <ul>
            {howTo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {limitations.length > 0 && (
        <div>
          <div className="demo-notes__k">
            <Icon name="circle-alert" size={14} /> In this archive
          </div>
          <ul>
            {limitations.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function VideoPlayer({ team, className = '', maxHeight = 760, tone = 'light' }) {
  const src = mediaUrl(team.slug, team.media.video);
  if (!src) return null;
  const poster = mediaUrl(team.slug, team.media.poster);
  return (
    <figure className={`video ${className}`}>
      <DeviceFrame device="phone" maxWidth={380} maxHeight={maxHeight} tone={tone}>
        <video src={src} poster={poster ?? undefined} controls playsInline preload="none" />
      </DeviceFrame>
      {team.media.videoCaption && <figcaption>{team.media.videoCaption}</figcaption>}
    </figure>
  );
}

/** Horizontal strip of screenshots; click opens the lightbox. */
export function ScreenStrip({ team, screens = team.media.screens, tone = 'light' }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className={`strip strip--${tone}`}>
        {screens.map((s, k) => (
          <figure key={s.file} className={`strip__item strip__item--${s.device}`}>
            <button onClick={() => setOpen(k)} aria-label={`Enlarge: ${s.caption}`}>
              <img src={mediaUrl(team.slug, s.file)} alt={s.caption} loading="lazy" decoding="async" />
            </button>
            <figcaption>{s.caption}</figcaption>
          </figure>
        ))}
      </div>
      {open !== null && <Lightbox team={team} screens={screens} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </>
  );
}

export function Lightbox({ team, screens, index, onClose, onIndex }) {
  const s = screens[index];
  const go = (d) => onIndex((index + d + screens.length) % screens.length);
  useKeys((e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  }, [index]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={s.caption} onClick={onClose}>
      <button className="lightbox__close" onClick={onClose} aria-label="Close">
        <Icon name="x" size={22} />
      </button>
      <button className="lightbox__nav lightbox__nav--prev" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Previous">
        <Icon name="chevron-left" size={28} />
      </button>
      <figure className={`lightbox__fig lightbox__fig--${s.device}`} onClick={(e) => e.stopPropagation()}>
        <img src={mediaUrl(team.slug, s.file)} alt={s.caption} />
        <figcaption>
          <span className="mono">
            {String(index + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}
          </span>
          {s.caption}
        </figcaption>
      </figure>
      <button className="lightbox__nav lightbox__nav--next" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Next">
        <Icon name="chevron-right" size={28} />
      </button>
    </div>
  );
}

/** Pitch deck slide images (if the team had a deck) with a link to their HTML deck. */
export function DeckStrip({ team }) {
  const deck = team.media.deck;
  const [open, setOpen] = useState(null);
  if (!deck || (!deck.slides.length && !deck.html && !deck.pdf)) return null;
  const screens = deck.slides.map((f, k) => ({ file: f, caption: `${deck.title ?? 'Pitch deck'}, slide ${k + 1}`, device: 'desktop' }));
  return (
    <div className="deck">
      {screens.length > 0 && (
        <div className="deck__slides">
          {screens.map((s, k) => (
            <button key={s.file} onClick={() => setOpen(k)} aria-label={s.caption}>
              <img src={mediaUrl(team.slug, s.file)} alt={s.caption} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="deck__links">
        {deck.html && (
          <a className="link-btn" href={demoUrl(deck.html)} target="_blank" rel="noreferrer">
            <Icon name="presentation" size={14} /> Open their pitch deck
          </a>
        )}
        {deck.pdf && (
          <a className="link-btn" href={mediaUrl(team.slug, deck.pdf)} target="_blank" rel="noreferrer">
            <Icon name="file-text" size={14} /> Deck as PDF
          </a>
        )}
      </div>
      {open !== null && <Lightbox team={team} screens={screens} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </div>
  );
}
