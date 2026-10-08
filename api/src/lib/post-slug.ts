import { prisma } from "./prisma.js";

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "update"
  );
}

// "new-dashboard", then "new-dashboard-2", "new-dashboard-3", ...
export async function uniquePostSlug(projectId: string, title: string) {
  const base = slugify(title);
  let slug = base;
  let i = 2;

  while (
    await prisma.post.findUnique({
      where: { projectId_slug: { projectId, slug } },
      select: { id: true },
    })
  ) {
    slug = `${base}-${i++}`;
  }
  return slug;
}