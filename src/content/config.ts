import { defineCollection, z } from 'astro:content';
import { r2Loader } from '../lib/r2-loader';

const blog = defineCollection({
  loader: r2Loader({ prefix: 'Blog/' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const thoughts = defineCollection({
  loader: r2Loader({ prefix: 'Thoughts/' }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    /** Minimum visit count required to see this thought */
    unlockAt: z.number().default(3),
  }),
});

export const collections = { blog, thoughts };
