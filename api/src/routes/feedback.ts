import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireProjectRole } from "../middleware/project.js";
import { commentDto, feedbackDto } from "../lib/feedback-dto.js";

const router = Router({ mergeParams: true });

const statuses = ["UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "DONE", "DECLINED"] as const;

const listQuery = z.object({
  status: z.enum(statuses).optional(),
  sort: z.enum(["top", "new"]).default("top"),
  q: z.string().trim().max(100).optional(),
});

const statusSchema = z.object({ status: z.enum(statuses) });
const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

async function getFeedbackOr404(projectId: string, id: string) {
  const item = await prisma.feedback.findFirst({ where: { id, projectId } });
  if (!item) throw new HttpError(404, "Idea not found");
  return item;
}

// List + status counts for the tabs
router.get("/", requireProjectRole(), async (req, res) => {
  const { status, sort, q } = listQuery.parse(req.query);
  const projectId = res.locals.project.id as string;

  const where: Prisma.FeedbackWhereInput = {
    projectId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, grouped] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy:
        sort === "top"
          ? [{ voteCount: "desc" }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }],
      take: 200,
    }),
    prisma.feedback.groupBy({
      by: ["status"],
      where: { projectId },
      _count: { _all: true },
    }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));

  res.json({
    items: items.map((i) => feedbackDto(i, { includeEmail: true })),
    counts,
  });
});

// One idea with its comments
router.get("/:id", requireProjectRole(), async (req, res) => {
  const id = req.params.id as string;
  const item = await prisma.feedback.findFirst({
    where: { id, projectId: res.locals.project.id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!item) throw new HttpError(404, "Idea not found");

  res.json({
    item: {
      ...feedbackDto(item, { includeEmail: true }),
      comments: item.comments.map(commentDto),
    },
  });
});

// Change status (OWNER / ADMIN)
router.patch("/:id", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const { status } = statusSchema.parse(req.body);
  const existing = await getFeedbackOr404(res.locals.project.id, id);

  const item = await prisma.feedback.update({
    where: { id: existing.id },
    data: { status },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  res.json({
    item: {
      ...feedbackDto(item, { includeEmail: true }),
      comments: item.comments.map(commentDto),
    },
  });
});

// Delete an idea (OWNER / ADMIN)
router.delete("/:id", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await getFeedbackOr404(res.locals.project.id, id);
  await prisma.feedback.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

// Reply as the team (any member)
router.post("/:id/comments", requireProjectRole(), async (req, res) => {
  const id = req.params.id as string;
  const { body } = commentSchema.parse(req.body);
  const existing = await getFeedbackOr404(res.locals.project.id, id);

  const user = await prisma.user.findUnique({
    where: { id: res.locals.userId },
    select: { name: true },
  });

  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.feedbackComment.create({
      data: {
        feedbackId: existing.id,
        authorName: user?.name ?? "Team",
        body,
        isTeam: true,
        userId: res.locals.userId,
      },
    });
    await tx.feedback.update({
      where: { id: existing.id },
      data: { commentCount: { increment: 1 } },
    });
    return c;
  });

  res.status(201).json({ comment: commentDto(comment) });
});

// Delete a comment (OWNER / ADMIN)
router.delete("/:id/comments/:commentId", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const commentId = req.params.commentId as string;

  const comment = await prisma.feedbackComment.findFirst({
    where: { id: commentId, feedbackId: id, feedback: { projectId: res.locals.project.id } },
  });
  if (!comment) throw new HttpError(404, "Comment not found");

  await prisma.$transaction([
    prisma.feedbackComment.delete({ where: { id: comment.id } }),
    prisma.feedback.update({
      where: { id },
      data: { commentCount: { decrement: 1 } },
    }),
  ]);

  res.json({ ok: true });
});

export default router;