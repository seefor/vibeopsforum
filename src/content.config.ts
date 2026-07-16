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
    url: z
      .string()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
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
    // "member" = a community member's own repo; "tool" = a third-party tool a
    // member shared as something they use. Drives which section it renders in.
    origin: z.enum(["member", "tool"]),
    // For tools: which community member recommended it. Ignored for member repos
    // (their `author` is already the owner).
    sharedBy: z.string().optional(),
    category: z.enum([
      "netclaw",
      "frameworks",
      "mcp",
      "networking",
      "research",
      "community",
    ]),
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
    updatedDate: z.coerce.date().optional(),
  }),
});

const communityContent = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/community-content" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().url(),
    type: z.enum(["youtube", "podcast", "blog"]),
    creator: z.string(),
    tags: z.array(z.string()).default([]),
    submittedAt: z.coerce.date(),
  }),
});

const discussions = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/discussions" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    sourceUrl: z.string().url().optional(),
    sourceLabel: z.string().optional(),
    tags: z.array(z.string()).default([]),
    submittedAt: z.coerce.date(),
  }),
});

export const collections = {
  events,
  projects,
  resources,
  communityContent,
  discussions,
};
