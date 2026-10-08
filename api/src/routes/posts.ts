import { Router } from "express";
import type { Post, PostCategory, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireProjectRole } from "../middleware/project.js";
import { cleanHtml, makeExcerpt } from "../lib/content.js";
import { uniquePostSlug } from "../lib/post-slug.js";

// mergeParams lets this router read :slug from the parent path
const router = Router({ mergeParams: true });

const categories = ["NEW", "IMPROVED", "FIXED", "ANNOUNCEMENT"] as const;

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  content: z.string().max(100_000).default(""),
  category: z.enum(categories).default("NEW"),
  publish: z.boolean().default(false),
});

const updateSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  content: z.string().max(100_000).optional(),
  category: z.enum(categories).optional(),
});

const canPublish = (role: Role) => role === "OWNER" || role === "ADMIN";

type PostLike = Omit<Post, "content"> & {
  content?: string;
  author?: { name: string } | null;
};

function toDto(p: PostLike) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    category: p.category,
    status: p.status,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    author: p.author ?? null,
    ...(p.content !== undefined && { content: p.content }),
  };
}

async function getPostOr404(projectId: string, id: string) {
  const post = await prisma.post.findFirst({ where: { id, projectId } });
  if (!post) throw new HttpError(404, "Post not found");
  return post;
}

// List (no content, keeps the response small)
router.get("/", requireProjectRole(), async (_req, res) => {
  const posts = await prisma.post.findMany({
    where: { projectId: res.locals.project.id },
    orderBy: { updatedAt: "desc" },
    include: { author: { select: { name: true } } },
    omit: { content: true },
  });
  res.json({ posts: posts.map(toDto) });
});

// Create (any member can create a draft; publishing needs OWNER/ADMIN)
router.post("/", requireProjectRole(), async (req, res) => {
  const data = createSchema.parse(req.body);

  if (data.publish && !canPublish(res.locals.role)) {
    throw new HttpError(403, "Only owners and admins can publish");
  }

  const content = cleanHtml(data.content);
  const excerpt = makeExcerpt(content);
  if (data.publish && !excerpt) {
    throw new HttpError(400, "Add some content before publishing");
  }

  const projectId = res.locals.project.id as string;
  const slug = await uniquePostSlug(projectId, data.title);

  const post = await prisma.post.create({
    data: {
      title: data.title,
      slug,
      content,
      excerpt,
      category: data.category,
      status: data.publish ? "PUBLISHED" : "DRAFT",
      publishedAt: data.publish ? new Date() : null,
      projectId,
      authorId: res.locals.userId,
    },
    include: { author: { select: { name: true } } },
  });

  res.status(201).json({ post: toDto(post) });
});

// Get one (with content)
router.get("/:postId", requireProjectRole(), async (req, res) => {
  const postId = req.params.postId as string;

  const post = await prisma.post.findFirst({
    where: { id: postId, projectId: res.locals.project.id },
    include: { author: { select: { name: true } } },
  });
  if (!post) throw new HttpError(404, "Post not found");
  res.json({ post: toDto(post) });
});

// Update (members can only edit drafts)
router.patch("/:postId", requireProjectRole(), async (req, res) => {
  const postId = req.params.postId as string;
  const existing = await getPostOr404(res.locals.project.id, postId);
  const data = updateSchema.parse(req.body);

  if (existing.status === "PUBLISHED" && !canPublish(res.locals.role)) {
    throw new HttpError(403, "Only owners and admins can edit published posts");
  }

  const patch: {
    title?: string;
    category?: PostCategory;
    content?: string;
    excerpt?: string;
  } = {};

  if (data.title !== undefined) patch.title = data.title;
  if (data.category !== undefined) patch.category = data.category;
  if (data.content !== undefined) {
    patch.content = cleanHtml(data.content);
    patch.excerpt = makeExcerpt(patch.content);
    if (existing.status === "PUBLISHED" && !patch.excerpt) {
      throw new HttpError(400, "A published post cannot be empty");
    }
  }

  const post = await prisma.post.update({
    where: { id: existing.id },
    data: patch,
    include: { author: { select: { name: true } } },
  });
  res.json({ post: toDto(post) });
});

// Publish
router.post("/:postId/publish", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const postId = req.params.postId as string;
  const existing = await getPostOr404(res.locals.project.id, postId);
  if (!existing.excerpt) throw new HttpError(400, "Add some content before publishing");

  const post = await prisma.post.update({
    where: { id: existing.id },
    data: { status: "PUBLISHED", publishedAt: existing.publishedAt ?? new Date() },
    include: { author: { select: { name: true } } },
  });
  res.json({ post: toDto(post) });
});

// Unpublish (back to draft)
router.post("/:postId/unpublish", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const postId = req.params.postId as string;
  const existing = await getPostOr404(res.locals.project.id, postId);

  const post = await prisma.post.update({
    where: { id: existing.id },
    data: { status: "DRAFT" },
    include: { author: { select: { name: true } } },
  });
  res.json({ post: toDto(post) });
});

// Delete
router.delete("/:postId", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const postId = req.params.postId as string;
  const existing = await getPostOr404(res.locals.project.id, postId);

  await prisma.post.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;