import jwt from "jsonwebtoken";
import { HttpError } from "./error.js";
export function requireAuth(req, res, next) {
    const token = req.cookies?.token;
    if (!token)
        throw new HttpError(401, "Not authenticated");
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        res.locals.userId = payload.userId;
        next();
    }
    catch {
        throw new HttpError(401, "Invalid or expired token");
    }
}
