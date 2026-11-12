// Content is generated from the private archive by tools/content.mjs and bundled into the (encrypted) app.
import content from '../generated/content.json';
import config from '../../showcase.config.json';

export const BASE = import.meta.env.BASE_URL;
export const { event, results } = content;
export const config_ = config;

export const teams = [...content.teams].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
export const teamBySlug = Object.fromEntries(teams.map((t) => [t.slug, t]));
export const domainById = Object.fromEntries(event.domains.map((d) => [d.id, d]));
export const stageById = Object.fromEntries(event.stages.map((s) => [s.id, s]));

export const mediaUrl = (slug, file) => (file && file !== '__placeholder.webp' ? `${BASE}_content/teams/${slug}/${file}` : null);
export const demoUrl = (p) => `${BASE}${p}`;
export const dims = (slug, file) => content.dims[`${slug}/${file}`] ?? null;

export function neighbours(slug) {
  const i = teams.findIndex((t) => t.slug === slug);
  return { prev: teams[(i - 1 + teams.length) % teams.length], next: teams[(i + 1) % teams.length], index: i };
}

/** Awards for a team, only once results are published. */
export function awardsFor(slug) {
  if (!results.published) return [];
  const out = [];
  if (results.bestInShow === slug) out.push({ id: 'best-in-show', title: 'Best in Show', top: true });
  for (const c of results.categories) if (c.winner === slug) out.push({ id: c.id, title: c.title });
  if (results.finalists.includes(slug) && results.bestInShow !== slug) out.push({ id: 'finalist', title: 'Best in Show finalist' });
  return out;
}

export const ROLE_LABELS = {
  joiner: 'New joiner',
  manager: 'Line manager',
  buddy: 'Buddy',
  hr: 'People team',
  admin: 'Admin',
  recruiter: 'Recruiter',
};

/** Screens for a stage: screens tagged with the stage, then highlight screens for it. */
export function screensForStage(team, stageId) {
  const tagged = team.media.screens.filter((s) => s.stage === stageId);
  if (tagged.length) return tagged;
  return team.highlights
    .filter((h) => h.stage === stageId && h.screen)
    .map((h) => team.media.screens.find((s) => s.file === h.screen) ?? { file: h.screen, caption: h.title, device: 'phone' });
}

export const hasLive = (team) => team.demo.kind !== 'walkthrough' && team.demo.entries.length > 0;
export const hasVideo = (team) => Boolean(team.media.video);
