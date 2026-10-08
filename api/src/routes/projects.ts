import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import type { Role } from "../lib/role.js";
import { HttpError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/project.js";
import { RESERVED_SLUGS } from "../lib/slug.js";
import postRoutes from "./posts.js";

const router = Router();
router.use(requireAuth);
router.use("/:slug/posts", postRoutes);

const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(40, "Slug must be at most 40 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens only"
  )
  .refine((s) => !RESERVED_SLUGS.includes(s), "This slug is reserved");

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  websiteUrl: z.string().trim().url("Enter a valid URL").nullable().optional(),
});

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  createdAt: Date;
};

type MembershipRow = {
  project: ProjectRow;
  role: Role;
};

function toDto(p: ProjectRow, role: Role) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    websiteUrl: p.websiteUrl,
    role,
    createdAt: p.createdAt,
  };
}

// List all projects the current user belongs to
router.get("/", async (_req, res) => {
  const memberships = await prisma.projectMember.findMany({
    where: { userId: res.locals.userId },
    include: { project: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    projects: memberships.map((membership: MembershipRow) =>
      toDto(membership.project, membership.role)
    ),
  });
});

// Create a project (creator becomes OWNER)
router.post("/", async (req, res) => {
  const data = createSchema.parse(req.body);

  const taken = await prisma.project.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (taken) throw new HttpError(409, "This slug is already taken");

  try {
    const project = await prisma.project.create({
      data: {
        name: data.name,
        slug: data.slug,
        members: { create: { userId: res.locals.userId, role: "OWNER" } },
      },
    });
    res.status(201).json({ project: toDto(project, "OWNER") });
  } catch (e) {
    // Two people creating the same slug at the same moment
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      e.code === "P2002"
    ) {
      throw new HttpError(409, "This slug is already taken");
    }
    throw e;
  }
});

// Get one project (any member)
router.get("/:slug", requireProjectRole(), (_req, res) => {
  res.json({ project: toDto(res.locals.project, res.locals.role) });
});

// Update project (OWNER / ADMIN)
router.patch("/:slug", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const data = updateSchema.parse(req.body);
  const project = await prisma.project.update({
    where: { id: res.locals.project.id },
    data,
  });
  res.json({ project: toDto(project, res.locals.role) });
});

// Delete project (OWNER only)
router.delete("/:slug", requireProjectRole("OWNER"), async (_req, res) => {
  await prisma.project.delete({ where: { id: res.locals.project.id } });
  res.json({ ok: true });
});

export default router;
