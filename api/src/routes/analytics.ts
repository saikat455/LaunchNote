import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireProjectRole } from "../middleware/project.js";

const router = Router({ mergeParams: true });
const DAY = 86_400_000;

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

router.get("/", requireProjectRole(), async (req, res) => {
  const { days } = querySchema.parse(req.query);
  const projectId = res.locals.project.id as string;

  // start of the first day in range (UTC)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const since = new Date(today.getTime() - (days - 1) * DAY);

  const [daily, totalRows, widgetCounts, pageGroups, ideas] = await Promise.all([
    // views + unique visitors per day
    prisma.$queryRaw<{ day: Date; views: bigint; visitors: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) AS views,
             COUNT(DISTINCT "visitorId") AS visitors
      FROM "AnalyticsEvent"
      WHERE "projectId" = ${projectId}
        AND "type" = 'PAGE_VIEW'
        AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1`,

    // unique visitors over the whole range (cannot be summed from daily rows)
    prisma.$queryRaw<{ views: bigint; visitors: bigint }[]>`
      SELECT COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
      FROM "AnalyticsEvent"
      WHERE "projectId" = ${projectId}
        AND "type" = 'PAGE_VIEW'
        AND "createdAt" >= ${since}`,

    prisma.analyticsEvent.groupBy({
      by: ["type"],
      where: {
        projectId,
        createdAt: { gte: since },
        type: { in: ["WIDGET_OPEN", "WIDGET_CLICK"] },
      },
      _count: { _all: true },
    }),

    prisma.analyticsEvent.groupBy({
      by: ["page", "ref"],
      where: { projectId, type: "PAGE_VIEW", createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.feedback.findMany({
      where: { projectId, status: { not: "DECLINED" } },
      orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, title: true, voteCount: true, commentCount: true, status: true },
    }),
  ]);

  // fill days with no traffic so the chart has no gaps
  const byDay = new Map(daily.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    const row = byDay.get(date);
    return {
      date,
      views: Number(row?.views ?? 0),
      visitors: Number(row?.visitors ?? 0),
    };
  });

  const widget = Object.fromEntries(widgetCounts.map((r) => [r.type, r._count._all]));

  // split page groups into page totals and per-post views
  const pages: Record<string, number> = {};
  const postViews: { slug: string; views: number }[] = [];
  for (const g of pageGroups) {
    pages[g.page] = (pages[g.page] ?? 0) + g._count._all;
    if (g.page === "post" && g.ref) {
      postViews.push({ slug: g.ref, views: g._count._all });
    }
  }
  postViews.sort((a, b) => b.views - a.views);
  const top = postViews.slice(0, 5);

  const posts = top.length
    ? await prisma.post.findMany({
        where: { projectId, slug: { in: top.map((p) => p.slug) } },
        select: { slug: true, title: true },
      })
    : [];
  const titleBySlug = new Map(posts.map((p) => [p.slug, p.title]));

  res.json({
    days,
    totals: {
      views: Number(totalRows[0]?.views ?? 0),
      visitors: Number(totalRows[0]?.visitors ?? 0),
      widgetOpens: widget.WIDGET_OPEN ?? 0,
      widgetClicks: widget.WIDGET_CLICK ?? 0,
    },
    series,
    pages,
    topPosts: top.map((p) => ({
      slug: p.slug,
      title: titleBySlug.get(p.slug) ?? p.slug,
      views: p.views,
    })),
    topIdeas: ideas,
  });
});

export default router;