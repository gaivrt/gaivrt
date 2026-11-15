import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { r2Loader } from '../lib/r2-loader';

const blog = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/Blog/', stripTitleHeading: true }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    description: z.string().optional(),
    tags: z.preprocess(
      (v) => (Array.isArray(v) ? v : v == null ? [] : [String(v)]),
      z.array(z.string()),
    ).default([]),
    draft: z.boolean().default(false),
  }),
});

// The fragments live in the repo, not the vault: saving a note there would publish it
const thoughts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/thoughts' }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
  }),
});

const projects = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/Projects/' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    url: z.string().optional(),
    github: z.string().optional(),
  }),
});

const publications = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/Publications/' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    authors: z.string().optional(),
    venue: z.string().optional(),
    url: z.string().optional(),
  }),
});

const research = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/Research/' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
  }),
});

const cv = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/CV/' }),
  schema: z.object({
    title: z.string().optional(),
  }),
});

const about = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/About/' }),
  schema: z.object({
    title: z.string().optional(),
  }),
});

export const collections = { blog, thoughts, projects, publications, research, cv, about };
