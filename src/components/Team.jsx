import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Md, inline } from '../lib/md.jsx';
import { ROLE_LABELS, awardsFor, domainById, hasLive, hasVideo, mediaUrl, stageById } from '../lib/content.js';

export function DomainChips({ ids, onDark = false }) {
  return (
    <div className="chips">
      {ids.map((id) => (
        <span key={id} className={`chip ${onDark ? 'chip--dark' : ''}`}>
          {domainById[id] && <Icon name={domainById[id].icon ?? 'flag'} size={12} />}
          {domainById[id]?.title ?? id}
        </span>
      ))}
    </div>
  );
}

export function StageDots({ ids }) {
  return (
    <div className="stage-dots" aria-label="Journey stages covered">
      {Object.values(stageById).map((s) => (
        <span key={s.id} className={ids.includes(s.id) ? 'on' : ''} title={`${s.phase}: ${s.title}`} />
      ))}
    </div>
  );
}

export function AwardBadges({ slug, size = 'md' }) {
  const awards = awardsFor(slug);
  if (!awards.length) return null;
  return (
    <div className={`awards awards--${size}`}>
      {awards.map((a) => (
        <span key={a.id} className={`award ${a.top ? 'award--top' : ''}`}>
          <Icon name={a.top ? 'trophy' : 'award'} size={size === 'sm' ? 12 : 14} />
          {a.title}
        </span>
      ))}
    </div>
  );
}

export function DemoKind({ team, onDark = false }) {
  return (
    <div className="chips">
      {hasLive(team) && (
        <span className={`chip chip--live ${onDark ? 'chip--dark' : ''}`}>
          <span className="dot" /> Live demo
        </span>
      )}
      {hasVideo(team) && (
        <span className={`chip ${onDark ? 'chip--dark' : ''}`}>
          <Icon name="video" size={12} /> Walkthrough
        </span>
      )}
    </div>
  );
}

/** Card for team grids. */
export function TeamCard({ team, to }) {
  const cover = mediaUrl(team.slug, team.media.cover);
  const coverScreen = team.media.screens.find((s) => s.file === team.media.cover);
  return (
    <Link to={to} className="team-card">
      <div className={`team-card__visual ${coverScreen?.device === 'desktop' ? 'is-desktop' : ''}`}>
        {cover && <img src={cover} alt="" loading="lazy" decoding="async" />}
        <AwardBadges slug={team.slug} size="sm" />
      </div>
      <div className="team-card__body">
        <div className="team-card__eyebrow">
          {team.code ? `${team.code} · ` : ''}
          {team.product}
        </div>
        <h3 className="team-card__name">{team.name}</h3>
        <p className="team-card__tagline">{team.tagline}</p>
        <DomainChips ids={team.domains} />
        <div className="team-card__foot">
          <DemoKind team={team} />
          <span className="team-card__go">
            Open <Icon name="arrow-right" size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function Highlights({ team, onDark = false, columns = 2 }) {
  return (
    <div className={`highlights highlights--${columns} ${onDark ? 'highlights--dark' : ''}`}>
      {team.highlights.map((h, k) => (
        <div key={h.title} className="highlight">
          <div className="highlight__n mono">{String(k + 1).padStart(2, '0')}</div>
          <div>
            <h4 className="highlight__title">{h.title}</h4>
            <p className="highlight__body">{inline(h.body)}</p>
            {h.stage && stageById[h.stage] && <span className="highlight__stage">{stageById[h.stage].title}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProblemApproach({ team, onDark = false }) {
  return (
    <div className={`pa ${onDark ? 'pa--dark' : ''}`}>
      <div className="pa__col">
        <div className="eyebrow">The problem they saw</div>
        <Md text={team.problem} className="pa__text" />
      </div>
      <div className="pa__arrow" aria-hidden="true">
        <Icon name="arrow-right" size={22} />
      </div>
      <div className="pa__col">
        <div className="eyebrow">What they built</div>
        <Md text={team.approach} className="pa__text" />
      </div>
    </div>
  );
}

export function RealVsSimulated({ team, onDark = false }) {
  const r = team.realVsSimulated;
  if (!r) return null;
  return (
    <div className={`rvs ${onDark ? 'rvs--dark' : ''}`}>
      <div>
        <div className="rvs__k">
          <Icon name="check" size={14} /> Real
        </div>
        <ul>
          {r.real.map((x) => (
            <li key={x}>{inline(x)}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="rvs__k rvs__k--sim">
          <Icon name="layers" size={14} /> Simulated
        </div>
        <ul>
          {r.simulated.map((x) => (
            <li key={x}>{inline(x)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Facts({ team, onDark = false }) {
  return (
    <dl className={`facts ${onDark ? 'facts--dark' : ''}`}>
      <div>
        <dt>Built for</dt>
        <dd>{team.roles.map((r) => ROLE_LABELS[r] ?? r).join(' · ')}</dd>
      </div>
      <div>
        <dt>Stack</dt>
        <dd className="facts__tech">
          {team.tech.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </dd>
      </div>
      {team.sideQuests.length > 0 && (
        <div>
          <dt>Side quests</dt>
          <dd>{team.sideQuests.join(' · ')}</dd>
        </div>
      )}
      <div>
        <dt>Source</dt>
        <dd>
          <a className="inline-link" href={team.source.fork} target="_blank" rel="noreferrer">
            {team.source.fork.replace('https://github.com/', '')}
          </a>{' '}
          <span className="mono facts__sha">
            {team.source.branch}@{team.source.sha.slice(0, 7)}
          </span>
        </dd>
      </div>
    </dl>
  );
}

export function Quote({ team, onDark = false }) {
  if (!team.quote) return null;
  return (
    <blockquote className={`quote ${onDark ? 'quote--dark' : ''}`}>
      <p>“{team.quote.text}”</p>
      {team.quote.by && <cite>{team.quote.by}</cite>}
    </blockquote>
  );
}
