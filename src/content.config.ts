import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro:schema";

const events = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/events" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    timezone: z.string(),
    location: z.string(),
    url: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    repoUrl: z.string().url(),
    owner: z.string(),
    repo: z.string(),
    description: z.string(),
    author: z.string(),
    tags: z.array(z.string()).default([]),
    submittedAt: z.coerce.date(),
    stars: z.number().optional(),
    language: z.string().optional(),
  }),
});

const resources = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/resources" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    topic: z.enum(["vibecoding", "ao", "a2a", "mcp"]),
    order: z.number().default(0),
  }),
});

export const collections = {
  events,
  projects,
  resources,
};
