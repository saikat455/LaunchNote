import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireProjectRole } from "../middleware/project.js";

const router = Router({ mergeParams: true });

const columns = ["UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "DONE"] as const;

const orderSchema = z.object({
  status: z.enum(columns),
  ids: z.array(z.string().min(1)).max(300),
});

// Board data for the team (any member can view)
router.get("/", requireProjectRole(), async (_req, res) => {
  const items = await prisma.feedback.findMany({
    where: { projectId: res.locals.project.id, status: { in: [...columns] } },
    orderBy: [{ roadmapPosition: "asc" }, { voteCount: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { post: { select: { id: true, title: true } } },
  });

  res.json({
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      voteCount: i.voteCount,
      commentCount: i.commentCount,
      roadmapPosition: i.roadmapPosition,
      post: i.post,
    })),
  });
});

// Save one column: moves every listed idea into `status` in exactly this order.
// Covers both "dragged to another column" and "reordered inside a column".
router.put("/order", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const { status, ids } = orderSchema.parse(req.body);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "Duplicate ids");

  const projectId = res.locals.project.id as string;

  if (ids.length > 0) {
    const found = await prisma.feedback.count({
      where: { id: { in: ids }, projectId },
    });
    if (found !== ids.length) throw new HttpError(404, "Some ideas were not found");
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.feedback.update({
        where: { id },
        data: { status, roadmapPosition: index + 1 },
      })
    )
  );

  res.json({ ok: true });
});

export default router;