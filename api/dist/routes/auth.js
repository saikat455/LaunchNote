import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
const router = Router();
const registerSchema = z.object({
    name: z.string().min(2).max(60),
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(100),
});
const loginSchema = z.object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(1),
});
function setAuthCookie(res, userId) {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });
    res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
});
router.post("/register", async (req, res) => {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists)
        throw new HttpError(409, "Email already in use");
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
        data: { name: data.name, email: data.email, passwordHash },
    });
    setAuthCookie(res, user.id);
    res.status(201).json({ user: publicUser(user) });
});
router.post("/login", async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    const valid = user && (await bcrypt.compare(data.password, user.passwordHash));
    if (!user || !valid)
        throw new HttpError(401, "Invalid email or password");
    setAuthCookie(res, user.id);
    res.json({ user: publicUser(user) });
});
router.post("/logout", (_req, res) => {
    res.clearCookie("token");
    res.json({ ok: true });
});
router.get("/me", requireAuth, async (_req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: res.locals.userId },
    });
    if (!user)
        throw new HttpError(401, "User not found");
    res.json({ user: publicUser(user) });
});
export default router;
