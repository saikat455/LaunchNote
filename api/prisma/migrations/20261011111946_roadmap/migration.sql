-- DropIndex
DROP INDEX "Feedback_projectId_status_idx";

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "postId" TEXT,
ADD COLUMN     "roadmapPosition" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Feedback_projectId_status_roadmapPosition_idx" ON "Feedback"("projectId", "status", "roadmapPosition");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
