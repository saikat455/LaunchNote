import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { HttpError } from "./error.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) throw new HttpError(401, "Not authenticated");

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };
    res.locals.userId = payload.userId;
    next();
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
}