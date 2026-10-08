import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

async function findProject(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true, websiteUrl: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

router.get("/:slug", async (req, res) => {
  const { id: _id, ...project } = await findProject(req.params.slug);
  res.json({ project });
});

router.get("/:slug/posts", async (req, res) => {
  const project = await findProject(req.params.slug);
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
  const project = await findProject(req.params.slug);
  const post = await prisma.post.findFirst({
    where: { projectId: project.id, slug: req.params.postSlug, status: "PUBLISHED" },
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

export default router;