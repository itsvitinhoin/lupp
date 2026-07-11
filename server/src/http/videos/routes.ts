import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { uploadVideoHandler, UploadVideoSchema } from "./upload-video";
import { videoStatusHandler, VideoStatusSchema } from "./video-status";
import { deleteVideoHandler, DeleteVideoSchema } from "./delete-video";

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
}
