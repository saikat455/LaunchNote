import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { readVoterId } from "../lib/voter.js";
import { trackLimiter } from "../lib/rate-limit.js";

const router = Router();

async function findProject(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

// Latest published posts for the widget
router.get("/:slug/posts", async (req, res) => {
  const slug = req.params.slug as string;
  const project = await findProject(slug);

  const posts = await prisma.post.findMany({
    where: { projectId: project.id, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, slug: true, excerpt: true, category: true, publishedAt: true },
  });

  // "Installed" heartbeat, written at most once per hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  void prisma.project
    .updateMany({
      where: {
        id: project.id,
        OR: [{ widgetLastSeenAt: null }, { widgetLastSeenAt: { lt: hourAgo } }],
      },
      data: { widgetLastSeenAt: new Date() },
    })
    .catch(() => {});

  res.set("Cache-Control", "public, max-age=60");
  res.json({
    project: { name: project.name },
    siteUrl: process.env.CLIENT_URL ?? "",
    posts,
  });
});

const eventSchema = z.object({
  type: z.enum(["open", "click"]),
  vid: z.string(),
  ref: z.string().trim().max(80).optional(),
});

// Widget opened / post clicked
router.post("/:slug/event", trackLimiter, async (req, res) => {
  const data = eventSchema.parse(req.body);
  const visitorId = readVoterId(data.vid);
  if (!visitorId) throw new HttpError(400, "Invalid visitor id");

  const project = await findProject(req.params.slug as string);

  await prisma.analyticsEvent.create({
    data: {
      projectId: project.id,
      visitorId,
      type: data.type === "open" ? "WIDGET_OPEN" : "WIDGET_CLICK",
      page: "widget",
      ref: data.ref ?? null,
    },
  });

  res.status(204).end();
});

export default router;