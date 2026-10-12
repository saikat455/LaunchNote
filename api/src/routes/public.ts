import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { commentDto, feedbackDto } from "../lib/feedback-dto.js";
import { readVoterId } from "../lib/voter.js";
import { submitLimiter, writeLimiter } from "../lib/rate-limit.js";

const router = Router();

async function findProject(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true, websiteUrl: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

/* ------------------------------ Changelog ------------------------------ */

router.get("/:slug", async (req, res) => {
  const { id: _id, ...project } = await findProject(req.params.slug as string);
  res.json({ project });
});

router.get("/:slug/posts", async (req, res) => {
  const project = await findProject(req.params.slug as string);
  const posts = await prisma.post.findMany({
    where: { projectId: project.id, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      category: true,
      publishedAt: true,
    },
  });
  res.json({ posts });
});

router.get("/:slug/posts/:postSlug", async (req, res) => {
  const project = await findProject(req.params.slug as string);
  const post = await prisma.post.findFirst({
    where: {
      projectId: project.id,
      slug: req.params.postSlug as string,
      status: "PUBLISHED",
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      category: true,
      publishedAt: true,
    },
  });
  if (!post) throw new HttpError(404, "Post not found");
  res.json({ post });
});

/* ------------------------------- Feedback ------------------------------ */

const publicStatuses = ["UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "DONE"] as const;

const listQuery = z.object({
  sort: z.enum(["top", "new"]).default("top"),
  status: z.enum(publicStatuses).optional(),
  q: z.string().trim().max(100).optional(),
});

const ideaSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(120),
  description: z.string().trim().max(2000).default(""),
  name: z.string().trim().min(2, "Enter your name").max(60),
  email: z.string().trim().email("Enter a valid email").max(120).optional().or(z.literal("")),
});

const commentSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  body: z.string().trim().min(1, "Write a comment").max(2000),
});

// Public list; "voted" is true for ideas this visitor already upvoted
router.get("/:slug/feedback", async (req, res) => {
  const project = await findProject(req.params.slug as string);
  const { sort, status, q } = listQuery.parse(req.query);

  const where: Prisma.FeedbackWhereInput = {
    projectId: project.id,
    status: status ?? { not: "DECLINED" },
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const items = await prisma.feedback.findMany({
    where,
    orderBy:
      sort === "top"
        ? [{ voteCount: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }],
    take: 100,
  });

  const voterId = readVoterId(req.get("x-voter-id"));
  let votedIds = new Set<string>();
  if (voterId && items.length > 0) {
    const votes = await prisma.feedbackVote.findMany({
      where: { voterId, feedbackId: { in: items.map((i) => i.id) } },
      select: { feedbackId: true },
    });
    votedIds = new Set(votes.map((v) => v.feedbackId));
  }

  res.json({
    items: items.map((i) => ({ ...feedbackDto(i), voted: votedIds.has(i.id) })),
  });
});

// Submit a new idea (the author's own vote is added automatically)
router.post("/:slug/feedback", submitLimiter, async (req, res) => {
  const project = await findProject(req.params.slug as string);
  const data = ideaSchema.parse(req.body);
  const voterId = readVoterId(req.get("x-voter-id"));

  const item = await prisma.feedback.create({
    data: {
      projectId: project.id,
      title: data.title,
      description: data.description,
      authorName: data.name,
      authorEmail: data.email ? data.email : null,
      voteCount: voterId ? 1 : 0,
      ...(voterId ? { votes: { create: { voterId } } } : {}),
    },
  });

  res.status(201).json({ item: { ...feedbackDto(item), voted: !!voterId } });
});

// One idea with comments
router.get("/:slug/feedback/:id", async (req, res) => {
  const project = await findProject(req.params.slug as string);
  const id = req.params.id as string;

  const item = await prisma.feedback.findFirst({
    where: { id, projectId: project.id, status: { not: "DECLINED" } },
    include: { comments: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  if (!item) throw new HttpError(404, "Idea not found");

  const voterId = readVoterId(req.get("x-voter-id"));
  const voted = voterId
    ? !!(await prisma.feedbackVote.findUnique({
        where: { feedbackId_voterId: { feedbackId: id, voterId } },
        select: { id: true },
      }))
    : false;

  res.json({
    item: { ...feedbackDto(item), voted, comments: item.comments.map(commentDto) },
  });
});

// Toggle vote (click once to vote, click again to remove)
router.post("/:slug/feedback/:id/vote", writeLimiter, async (req, res) => {
  const voterId = readVoterId(req.get("x-voter-id"));
  if (!voterId) throw new HttpError(400, "Missing voter id");

  const project = await findProject(req.params.slug as string);
  const id = req.params.id as string;

  const exists = await prisma.feedback.findFirst({
    where: { id, projectId: project.id, status: { not: "DECLINED" } },
    select: { id: true },
  });
  if (!exists) throw new HttpError(404, "Idea not found");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.feedbackVote.findUnique({
        where: { feedbackId_voterId: { feedbackId: id, voterId } },
      });

      if (existing) {
        await tx.feedbackVote.delete({ where: { id: existing.id } });
        const f = await tx.feedback.update({
          where: { id },
          data: { voteCount: { decrement: 1 } },
          select: { voteCount: true },
        });
        return { voted: false, voteCount: f.voteCount };
      }

      await tx.feedbackVote.create({ data: { feedbackId: id, voterId } });
      const f = await tx.feedback.update({
        where: { id },
        data: { voteCount: { increment: 1 } },
        select: { voteCount: true },
      });
      return { voted: true, voteCount: f.voteCount };
    });

    res.json(result);
  } catch (e) {
    // two clicks at the exact same moment
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      (e.code === "P2002" || e.code === "P2025")
    ) {
      throw new HttpError(409, "Please try again");
    }
    throw e;
  }
});

// Public comment
router.post("/:slug/feedback/:id/comments", submitLimiter, async (req, res) => {
  const project = await findProject(req.params.slug as string);
  const id = req.params.id as string;
  const data = commentSchema.parse(req.body);

  const exists = await prisma.feedback.findFirst({
    where: { id, projectId: project.id, status: { not: "DECLINED" } },
    select: { id: true },
  });
  if (!exists) throw new HttpError(404, "Idea not found");

  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.feedbackComment.create({
      data: { feedbackId: id, authorName: data.name, body: data.body },
    });
    await tx.feedback.update({
      where: { id },
      data: { commentCount: { increment: 1 } },
    });
    return c;
  });

  res.status(201).json({ comment: commentDto(comment) });
});

/* ------------------------------- Roadmap ------------------------------- */

const roadmapSelect = {
  id: true,
  title: true,
  voteCount: true,
  commentCount: true,
  post: { select: { title: true, slug: true, status: true } },
} satisfies Prisma.FeedbackSelect;

type RoadmapRow = Prisma.FeedbackGetPayload<{ select: typeof roadmapSelect }>;

function roadmapCard(i: RoadmapRow) {
  return {
    id: i.id,
    title: i.title,
    voteCount: i.voteCount,
    commentCount: i.commentCount,
    // only link to the changelog post if it is actually published
    shippedPost:
      i.post && i.post.status === "PUBLISHED"
        ? { title: i.post.title, slug: i.post.slug }
        : null,
  };
}

router.get("/:slug/roadmap", async (req, res) => {
  const project = await findProject(req.params.slug as string);

  const load = (status: "PLANNED" | "IN_PROGRESS" | "DONE") =>
    prisma.feedback.findMany({
      where: { projectId: project.id, status },
      select: roadmapSelect,
      orderBy:
        status === "DONE"
          ? [{ updatedAt: "desc" }]
          : [{ roadmapPosition: "asc" }, { voteCount: "desc" }, { createdAt: "desc" }],
      take: status === "DONE" ? 30 : 100,
    });

  const [planned, inProgress, done] = await Promise.all([
    load("PLANNED"),
    load("IN_PROGRESS"),
    load("DONE"),
  ]);

  res.json({
    roadmap: {
      planned: planned.map(roadmapCard),
      inProgress: inProgress.map(roadmapCard),
      done: done.map(roadmapCard),
    },
  });
});

export default router;