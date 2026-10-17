-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGE_VIEW', 'WIDGET_OPEN', 'WIDGET_CLICK');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "widgetLastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" "AnalyticsEventType" NOT NULL,
    "page" TEXT NOT NULL DEFAULT '',
    "ref" TEXT,
    "visitorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_projectId_type_createdAt_idx" ON "AnalyticsEvent"("projectId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_projectId_page_ref_idx" ON "AnalyticsEvent"("projectId", "page", "ref");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
