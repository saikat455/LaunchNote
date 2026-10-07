import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import type { Role } from "../lib/role.js";
import { HttpError } from "./error.js";

/**
 * Use after requireAuth on any route with a :slug param.
 * - requireProjectRole()                 -> any member
 * - requireProjectRole("OWNER","ADMIN")  -> only those roles
 *
 * On success it sets res.locals.project and res.locals.role.
 */
export function requireProjectRole(...allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const slug = req.params.slug as string;

    const member = await prisma.projectMember.findFirst({
      where: { userId: res.locals.userId, project: { slug } },
      include: { project: true },
    });

    // 404 (not 403) so outsiders can't discover which slugs exist
    if (!member) throw new HttpError(404, "Project not found");

    if (allowed.length > 0 && !allowed.includes(member.role)) {
      throw new HttpError(403, "You don't have permission to do this");
    }

    res.locals.project = member.project;
    res.locals.role = member.role;
    next();
  };
}
