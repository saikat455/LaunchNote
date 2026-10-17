import { prisma } from "./prisma.js";

const INTERVAL_MS = 30_000;
let running = false;

// Publishes every scheduled post whose time has come. Returns how many it published.
export async function publishDuePosts() {
  if (running) return 0; // never overlap two runs in this process
  running = true;

  try {
    const due = await prisma.post.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
      select: { id: true, title: true, scheduledFor: true },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    });

    let published = 0;

    for (const post of due) {
      // Conditional update = "claim". If someone unscheduled or rescheduled the
      // post in the meantime (or another API instance got here first), count is 0.
      const { count } = await prisma.post.updateMany({
        where: {
          id: post.id,
          status: "SCHEDULED",
          scheduledFor: { lte: new Date() },
        },
        data: {
          status: "PUBLISHED",
          publishedAt: post.scheduledFor ?? new Date(),
          scheduledFor: null,
        },
      });

      if (count === 1) {
        published++;
        console.log(`[scheduler] published "${post.title}"`);
      }
    }

    return published;
  } catch (err) {
    console.error("[scheduler] run failed", err);
    return 0;
  } finally {
    running = false;
  }
}

export function startScheduler() {
  // run once on startup to catch anything that came due while the API was off
  void publishDuePosts();
  const timer = setInterval(() => void publishDuePosts(), INTERVAL_MS);
  return () => clearInterval(timer);
}