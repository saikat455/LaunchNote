import rateLimit from "express-rate-limit";

// Votes: 60 per 15 minutes per IP
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again in a few minutes." },
});

// New ideas and comments: 10 per hour per IP
export const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "You're posting too fast. Please try again later." },
});