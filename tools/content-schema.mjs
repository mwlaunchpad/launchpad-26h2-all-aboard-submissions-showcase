// Schema for the showcase content that lives in the PRIVATE archive repo under showcase/.
// tools/content.mjs validates against this at build time. See docs/CONTENT.md.
import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case slug');
const md = z.string().min(1); // markdown allowed (inline: **bold**, *em*, `code`, [links](...))

// Challenge areas from the brief (event.yml domains[].id)
export const DOMAIN_IDS = ['offer-handover', 'before-day-one', 'manager-buddy', 'first-30-days'];
// Reference journey stages from the brief (event.yml stages[].id)
export const STAGE_IDS = ['offer', 'unlock', 'meet', 'manager-ready', 'day-one-week-one', 'day-30'];
export const ROLE_IDS = ['joiner', 'manager', 'buddy', 'hr', 'admin', 'recruiter'];

export const eventSchema = z.object({
  name: z.string(), // "LaunchPad '26"
  edition: z.string(), // "Edition 02"
  nickname: z.string().optional(), // "All Aboard"
  dates: z.string(), // "9–10 November 2026"
  venue: z.string(),
  organiser: z.string(),
  format: z.string().optional(),
  brief: z.object({
    eyebrow: z.string().optional(),
    headline: z.string(), // plain words
    accent: z.string(), // gradient accent phrase
    body: md,
    problem: md.optional(),
  }),
  domains: z
    .array(
      z.object({
        id: z.enum(DOMAIN_IDS),
        title: z.string(),
        summary: z.string().optional(),
        icon: z.string().optional(), // Lucide icon name from src/components/Icon.jsx
        prompts: z.array(z.object({ title: z.string(), question: z.string(), icon: z.string().optional() })),
      }),
    )
    .length(4),
  stages: z
    .array(
      z.object({
        id: z.enum(STAGE_IDS),
        phase: z.string(),
        title: z.string(),
        description: z.string(),
        who: z.string().optional(),
        icon: z.string().optional(),
      }),
    )
    .length(6),
  sideQuests: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), feeds: z.string() })),
  judging: z.object({
    summary: md,
    categories: z.array(z.object({ id: slug, title: z.string(), body: z.string(), icon: z.string().optional() })),
    bestInShow: md,
    prizes: md.optional(),
  }),
  schedule: z.array(
    z.object({
      day: z.string(),
      items: z.array(z.object({ time: z.string(), title: z.string(), sub: z.string().optional(), pin: z.boolean().optional() })),
    }),
  ),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});

export const resultsSchema = z.object({
  published: z.boolean().default(false),
  categories: z.array(z.object({ id: slug, title: z.string(), winner: slug.nullable(), citation: z.string().optional() })),
  finalists: z.array(slug).default([]),
  bestInShow: slug.nullable().default(null),
  bestInShowCitation: z.string().optional(),
});

const mediaPath = z.string().regex(/^[^/].*\.(webp|png|jpg|jpeg|gif|svg|mp4|webm|pdf)$/i, 'path relative to the team media/ folder');

export const teamSchema = z.object({
  slug,
  name: z.string(),
  code: z.string().optional(), // "Team 04"
  product: z.string(),
  tagline: z.string().max(110),
  summary: z.string().max(600), // 2–3 plain sentences
  members: z.array(z.object({ name: z.string(), github: z.string().optional(), role: z.string().optional() })).default([]),
  domains: z.array(z.enum(DOMAIN_IDS)).min(1),
  stages: z.array(z.enum(STAGE_IDS)).min(1),
  sideQuests: z.array(z.string()).default([]),
  roles: z.array(z.enum(ROLE_IDS)).default(['joiner']),
  problem: z.string().max(400), // one short paragraph: the problem as the team framed it
  approach: z.string().max(400), // one short paragraph: their answer
  highlights: z
    .array(
      z.object({
        title: z.string(),
        body: z.string().max(320),
        stage: z.enum(STAGE_IDS).optional(),
        screen: mediaPath.optional(), // screen that illustrates it
      }),
    )
    .min(3)
    .max(8),
  realVsSimulated: z.object({ real: z.array(z.string()), simulated: z.array(z.string()) }).optional(),
  tech: z.array(z.string()).min(1),
  source: z.object({
    fork: z.string().url(),
    branch: z.string(),
    sha: z.string().regex(/^[0-9a-f]{40}$/),
    archivePath: z.string(),
  }),
  demo: z.object({
    kind: z.enum(['live', 'walkthrough', 'both']),
    entries: z
      .array(z.object({ label: z.string(), path: z.string().regex(/^demos\/[a-z0-9-]+\/.*$/), device: z.enum(['phone', 'desktop']).default('phone') }))
      .default([]),
    howTo: z.array(z.string()).default([]), // short tips for driving the demo
    limitations: z.array(z.string()).default([]),
  }),
  media: z.object({
    cover: mediaPath,
    screens: z
      .array(
        z.object({
          file: mediaPath,
          caption: z.string(),
          device: z.enum(['phone', 'desktop']).default('phone'),
          stage: z.enum(STAGE_IDS).optional(),
          role: z.enum(ROLE_IDS).optional(),
        }),
      )
      .min(1),
    video: mediaPath.optional(),
    poster: mediaPath.optional(),
    videoCaption: z.string().optional(),
    deck: z
      .object({
        title: z.string().optional(),
        slides: z.array(mediaPath).default([]),
        pdf: mediaPath.optional(),
        html: z.string().regex(/^demos\/[a-z0-9-]+\/.*$/).optional(),
      })
      .optional(),
  }),
  quote: z.object({ text: z.string(), by: z.string().optional() }).optional(),
});
