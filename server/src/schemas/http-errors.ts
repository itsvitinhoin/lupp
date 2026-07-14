import z from "zod";

/**
 * Error contract of the ported Supabase edge functions: machine-readable
 * `{ error: "snake_case_code" }` bodies the SPA switches on. Routes ported
 * from edge functions use these; new native routes use `errorSchemas`.
 */
const edgeError = z.object({ error: z.string() });

export const edgeErrorSchemas = {
  400: edgeError.describe("Missing/invalid field (machine-readable code)."),
  401: z
    .union([edgeError, z.object({ message: z.string() })])
    .describe("Missing or invalid session token."),
  402: edgeError.describe("Plan limit reached."),
  403: edgeError.describe("Not a member of the store."),
  404: edgeError.describe("Record not found."),
  409: edgeError.describe("Conflicting state."),
  500: z
    .union([edgeError, z.object({ message: z.string() })])
    .describe("Unhandled server error."),
  502: edgeError.describe("Upstream provider error."),
};

export const errorSchemas = {
  400: z.object({ message: z.string(), errors: z.any().optional(), context: z.any().optional() }).describe("General or validation errors."),
  401: z.object({ message: z.string() }).describe("User not authorized"),
  403: z.object({ message: z.string() }).describe("User forbidden for this resource"),
  404: z.object({ message: z.string() }).describe("Record not found"),
  409: z.object({ message: z.string() }).describe("Conflict, record already exists"),
  500: z.object({ message: z.string() }).describe("Server internal unhandled error"),
}

// Only rate-limited routes (the auth surface) respond with 429 — spread this
// into their response schemas alongside errorSchemas.
export const rateLimitErrorSchema = {
  429: z.object({ message: z.string() }).describe("Too many requests (rate limited)."),
}
