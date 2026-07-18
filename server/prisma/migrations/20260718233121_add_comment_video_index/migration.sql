-- CreateIndex
CREATE INDEX "comments_video_id_status_idx" ON "comments"("video_id", "status");
