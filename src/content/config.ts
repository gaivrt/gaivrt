import { defineCollection, z } from 'astro:content';
import { r2Loader } from '../lib/r2-loader';

const blog = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/Blog/' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const thoughts = defineCollection({
  loader: r2Loader({ prefix: 'gaivrt/Thoughts/' }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    /** Minimum visit count required to see this thought */
    unlockAt: z.number().default(3),
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
