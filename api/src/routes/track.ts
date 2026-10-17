import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { readVoterId } from "../lib/voter.js";
import { trackLimiter } from "../lib/rate-limit.js";

const router = Router();

const viewSchema = z.object({
  page: z.enum(["changelog", "post", "roadmap", "feedback"]),
  ref: z.string().trim().max(80).optional(),
});

router.post("/:slug/view", trackLimiter, async (req, res) => {
  const visitorId = readVoterId(req.get("x-voter-id"));
  if (!visitorId) {
    res.status(204).end(); // no id, nothing to count
    return;
  }

  const { page, ref } = viewSchema.parse(req.body);

  const project = await prisma.project.findUnique({
    where: { slug: req.params.slug as string },
    select: { id: true },
  });
  if (!project) throw new HttpError(404, "Project not found");

  // only count views of real, published posts
  if (page === "post") {
    const exists = ref
      ? await prisma.post.findFirst({
          where: { projectId: project.id, slug: ref, status: "PUBLISHED" },
          select: { id: true },
        })
      : null;
    if (!exists) {
      res.status(204).end();
      return;
    }
  }

  await prisma.analyticsEvent.create({
    data: {
      projectId: project.id,
      visitorId,
      type: "PAGE_VIEW",
      page,
      ref: page === "post" ? ref! : null,
    },
  });

  res.status(204).end();
});

export default router;