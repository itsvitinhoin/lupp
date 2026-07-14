import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { uploadVideoHandler, UploadVideoSchema } from "./upload-video";
import { videoStatusHandler, VideoStatusSchema } from "./video-status";
import { deleteVideoHandler, DeleteVideoSchema } from "./delete-video";
import { listVideosHandler, ListVideosSchema } from "./list-videos";
import { getVideoHandler, GetVideoSchema } from "./get-video";
import { videoMetricsHandler, VideoMetricsSchema } from "./video-metrics";
import { createVideoHandler, CreateVideoSchema } from "./create-video";
import { updateVideoHandler, UpdateVideoSchema } from "./update-video";
import { videoOrderingHandler, VideoOrderingSchema } from "./ordering";
import { uploadThumbnailHandler, UploadThumbnailSchema } from "./upload-thumbnail";

const THUMBNAIL_BODY_LIMIT = 10 * 1024 * 1024;

// Raw video uploads stream the whole file through the server; well above the
// default 1 MiB body limit.
const RAW_UPLOAD_BODY_LIMIT = 500 * 1024 * 1024;

export async function VideoRoutes(app: FastifyTypedInstance) {
  // bunny-upload-video accepts raw video bytes besides JSON control messages.
  // Buffer the binary content types so the handler can forward them to Bunny;
  // registering inside this plugin keeps the parsers scoped to video routes.
  const bufferBody = (
    _request: unknown,
    body: Buffer,
    done: (error: Error | null, result?: Buffer) => void,
  ) => done(null, body);
  app.addContentTypeParser<Buffer>(
    "application/octet-stream",
    { bodyLimit: RAW_UPLOAD_BODY_LIMIT, parseAs: "buffer" },
    bufferBody,
  );
  app.addContentTypeParser<Buffer>(
    /^video\//,
    { bodyLimit: RAW_UPLOAD_BODY_LIMIT, parseAs: "buffer" },
    bufferBody,
  );

  app.post(
    "/api/videos/upload",
    {
      schema: UploadVideoSchema.schema,
      preHandler: [verifyJwt],
      bodyLimit: RAW_UPLOAD_BODY_LIMIT,
    },
    uploadVideoHandler,
  );
  app.post(
    "/api/videos/status",
    { schema: VideoStatusSchema.schema, preHandler: [verifyJwt] },
    videoStatusHandler,
  );
  app.post(
    "/api/videos/delete",
    { schema: DeleteVideoSchema.schema, preHandler: [verifyJwt] },
    deleteVideoHandler,
  );

  // Thumbnails ride the image/* parser registered below; static paths
  // (metrics/ordering/thumbnail) take precedence over :videoId in fastify.
  app.addContentTypeParser<Buffer>(
    /^image\//,
    { bodyLimit: THUMBNAIL_BODY_LIMIT, parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.get(
    "/api/videos",
    { schema: ListVideosSchema.schema, preHandler: [verifyJwt] },
    listVideosHandler,
  );
  app.get(
    "/api/videos/metrics",
    { schema: VideoMetricsSchema.schema, preHandler: [verifyJwt] },
    videoMetricsHandler,
  );
  app.get(
    "/api/videos/:videoId",
    { schema: GetVideoSchema.schema, preHandler: [verifyJwt] },
    getVideoHandler,
  );
  app.post(
    "/api/videos",
    { schema: CreateVideoSchema.schema, preHandler: [verifyJwt] },
    createVideoHandler,
  );
  app.patch(
    "/api/videos/ordering",
    { schema: VideoOrderingSchema.schema, preHandler: [verifyJwt] },
    videoOrderingHandler,
  );
  app.patch(
    "/api/videos/:videoId",
    { schema: UpdateVideoSchema.schema, preHandler: [verifyJwt] },
    updateVideoHandler,
  );
  app.post(
    "/api/videos/thumbnail",
    {
      schema: UploadThumbnailSchema.schema,
      preHandler: [verifyJwt],
      bodyLimit: THUMBNAIL_BODY_LIMIT,
    },
    uploadThumbnailHandler,
  );
}
