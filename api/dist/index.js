import "dotenv/config";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import publicRoutes from "./routes/public.js";
import trackRoutes from "./routes/track.js";
import embedRoutes from "./routes/embed.js";
import inviteRoutes from "./routes/invites.js";
import { errorHandler } from "./middleware/error.js";
import { startScheduler } from "./lib/scheduler.js";
const app = express();
// We run behind a proxy in production (Render, and Vercel in front of it)
app.set("trust proxy", 1);
/* ---- Widget: used from ANY website (open CORS, no cookies). Keep these first. ---- */
app.get("/widget.js", (_req, res) => {
    res.set({
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "public, max-age=300",
    });
    res.type("application/javascript");
    res.sendFile(path.resolve(process.cwd(), "public", "widget.js"), (err) => {
        if (err && !res.headersSent)
            res.status(404).end();
    });
});
app.use("/embed", cors(), express.json({ limit: "4kb" }), embedRoutes);
/* ---- Everything else ---- */
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);
app.use("/invites", inviteRoutes);
app.use("/public", trackRoutes);
app.use("/public", publicRoutes);
app.use(errorHandler);
const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
    startScheduler();
    console.log("Scheduler started (checks every 30 seconds)");
});
