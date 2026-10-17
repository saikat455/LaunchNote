import { Router } from "express";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireProjectRole } from "../middleware/project.js";
import { hashInviteToken, newInviteToken } from "../lib/invite-token.js";

const router = Router({ mergeParams: true });

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_INVITES = 20;

const roleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });
const transferSchema = z.object({ memberId: z.string().min(1) });

async function getMemberOr404(projectId: string, id: string) {
  const member = await prisma.projectMember.findFirst({ where: { id, projectId } });
  if (!member) throw new HttpError(404, "Member not found");
  return member;
}

// Members (everyone) + pending invites (owner/admin only)
router.get("/", requireProjectRole(), async (_req, res) => {
  const projectId = res.locals.project.id as string;
  const myRole = res.locals.role as Role;
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  const invites = canManage
    ? await prisma.projectInvite.findMany({
        where: { projectId, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  res.json({
    currentUserId: res.locals.userId,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
});

// Create an invite link. The raw token is returned ONCE and never stored.
router.post("/invites", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const { role } = roleSchema.parse(req.body);

  if (role === "ADMIN" && res.locals.role !== "OWNER") {
    throw new HttpError(403, "Only the owner can invite admins");
  }

  const projectId = res.locals.project.id as string;
  const pending = await prisma.projectInvite.count({
    where: { projectId, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pending >= MAX_PENDING_INVITES) {
    throw new HttpError(400, "Too many pending invites. Revoke some first.");
  }

  const token = newInviteToken();
  const invite = await prisma.projectInvite.create({
    data: {
      projectId,
      role,
      tokenHash: hashInviteToken(token),
      createdById: res.locals.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  res.status(201).json({ token, expiresAt: invite.expiresAt });
});

// Revoke a pending invite
router.delete("/invites/:inviteId", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const inviteId = req.params.inviteId as string;
  const { count } = await prisma.projectInvite.deleteMany({
    where: { id: inviteId, projectId: res.locals.project.id, usedAt: null },
  });
  if (count === 0) throw new HttpError(404, "Invite not found");
  res.json({ ok: true });
});

// Leave the project (the owner must transfer ownership first)
router.post("/leave", requireProjectRole(), async (_req, res) => {
  if (res.locals.role === "OWNER") {
    throw new HttpError(
      400,
      "Transfer ownership before leaving, or delete the project in Settings."
    );
  }
  await prisma.projectMember.deleteMany({
    where: { projectId: res.locals.project.id, userId: res.locals.userId },
  });
  res.json({ ok: true });
});

// Transfer ownership: target becomes OWNER, you become ADMIN (one transaction)
router.post("/transfer", requireProjectRole("OWNER"), async (req, res) => {
  const { memberId } = transferSchema.parse(req.body);
  const projectId = res.locals.project.id as string;
  const target = await getMemberOr404(projectId, memberId);

  if (target.userId === res.locals.userId) {
    throw new HttpError(400, "You are already the owner");
  }

  await prisma.$transaction([
    prisma.projectMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
    prisma.projectMember.updateMany({
      where: { projectId, userId: res.locals.userId },
      data: { role: "ADMIN" },
    }),
  ]);

  res.json({ ok: true });
});

// Change a member's role (owner only)
router.patch("/:memberId", requireProjectRole("OWNER"), async (req, res) => {
  const memberId = req.params.memberId as string;
  const { role } = roleSchema.parse(req.body);
  const target = await getMemberOr404(res.locals.project.id, memberId);

  if (target.role === "OWNER") {
    throw new HttpError(400, "Use Transfer ownership to change the owner");
  }

  await prisma.projectMember.update({ where: { id: target.id }, data: { role } });
  res.json({ ok: true });
});

// Remove a member (owner removes anyone but the owner; admins remove members only)
router.delete("/:memberId", requireProjectRole("OWNER", "ADMIN"), async (req, res) => {
  const memberId = req.params.memberId as string;
  const target = await getMemberOr404(res.locals.project.id, memberId);

  if (target.role === "OWNER") throw new HttpError(400, "The owner can't be removed");
  if (target.userId === res.locals.userId) {
    throw new HttpError(400, "Use Leave project instead");
  }
  if (res.locals.role === "ADMIN" && target.role !== "MEMBER") {
    throw new HttpError(403, "Admins can only remove members");
  }

  await prisma.projectMember.delete({ where: { id: target.id } });
  res.json({ ok: true });
});

export default router;