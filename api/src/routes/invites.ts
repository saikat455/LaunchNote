import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../lib/rate-limit.js";
import { hashInviteToken } from "../lib/invite-token.js";

const router = Router();

const INVALID = "This invite link is invalid or has expired";

async function findValidInvite(token: string) {
  const invite = await prisma.projectInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { project: { select: { name: true, slug: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
    throw new HttpError(404, INVALID);
  }
  return invite;
}

// Public preview
router.get("/:token", writeLimiter, async (req, res) => {
  const invite = await findValidInvite(req.params.token as string);
  res.json({
    invite: {
      projectName: invite.project.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
  });
});

// Accept (must be logged in)
router.post("/:token/accept", requireAuth, writeLimiter, async (req, res) => {
  const invite = await findValidInvite(req.params.token as string);
  const userId = res.locals.userId as string;

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId: invite.projectId } },
    select: { id: true },
  });
  if (existing) {
    res.json({ slug: invite.project.slug, alreadyMember: true });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // "Claim" the link: only one request can flip usedAt from null
    const claimed = await tx.projectInvite.updateMany({
      where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date(), usedById: userId },
    });
    if (claimed.count !== 1) throw new HttpError(404, INVALID);

    await tx.projectMember.create({
      data: { userId, projectId: invite.projectId, role: invite.role },
    });
  });

  res.status(201).json({ slug: invite.project.slug, alreadyMember: false });
});

export default router;