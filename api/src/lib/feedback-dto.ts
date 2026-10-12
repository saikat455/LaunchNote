import type { Feedback, FeedbackComment } from "@prisma/client";

// Team-only fields (email, linked post) are never included on public pages
export function feedbackDto(f: Feedback, opts: { includeEmail?: boolean } = {}) {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    status: f.status,
    authorName: f.authorName,
    ...(opts.includeEmail ? { authorEmail: f.authorEmail, postId: f.postId } : {}),
    voteCount: f.voteCount,
    commentCount: f.commentCount,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

export function commentDto(c: FeedbackComment) {
  return {
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    isTeam: c.isTeam,
    createdAt: c.createdAt,
  };
}