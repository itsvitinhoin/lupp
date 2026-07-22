import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { ROLES } from "@/schemas/roles";
import { Prisma } from "../../../generated/prisma/client";
import { requireAdmin } from "./admin-gate";

// Platform-wide, cursor-paginated user list for the admin console Users tab.
// Same cursor mechanics as store-lists.ts: uuid(7) ids are time-ordered, so
// orderBy id desc + cursor:{id} + skip:1 gives newest-first paging for free.

const ListQuerySchema = z.object({
  cursor: z.string().optional().describe("Id of the last item from the previous page."),
  email_confirmed: z
    .enum(["true", "false"])
    .optional()
    .describe("Filter by email confirmation state."),
  limit: z.coerce.number().optional().describe("Page size (default 20, max 50)."),
  role: z.enum(ROLES).optional().describe("Filter by platform role."),
  search: z.string().optional().describe("Case-insensitive match on name or email."),
  store_id: z
    .string()
    .optional()
    .describe("Only users who own or are members of this store."),
});

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const insensitive = (value: string) => ({ contains: value, mode: "insensitive" as const });

const USER_ROW_SELECT = {
  avatar_url: true,
  created_at: true,
  email: true,
  email_confirmed_at: true,
  id: true,
  memberships: {
    select: { id: true, role: true, store: { select: { id: true, name: true, slug: true } } },
  },
  name: true,
  role: true,
  stores: { select: { id: true, name: true, slug: true, status: true } },
  updated_at: true,
} satisfies Prisma.UserSelect;

export const AdminConsoleUsersSchema = {
  schema: {
    summary: "Admin console users",
    description:
      "Cursor-paginated, platform-wide user list for the admin console Users tab. Filters by " +
      "role, email confirmation state, store membership (owner or member) and a " +
      "case-insensitive name/email search. Caller's account must hold the admin role.",
    tags: ["admin-console"],
    operationId: "getAdminConsoleUsers",
    security: [{ bearerAuth: [] }],
    querystring: ListQuerySchema,
    response: {
      200: z.object({ items: z.array(z.any()), next_cursor: z.string().nullable() }).loose(),
      ...edgeErrorSchemas,
    },
  },
};

export async function adminConsoleUsersHandler(request: FastifyRequest, reply: FastifyReply) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const query = ListQuerySchema.parse(request.query ?? {});
  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const search = (query.search ?? "").trim();

  const conditions: Prisma.UserWhereInput[] = [];
  if (search) {
    conditions.push({ OR: [{ name: insensitive(search) }, { email: insensitive(search) }] });
  }
  if (query.role) conditions.push({ role: query.role });
  if (query.email_confirmed === "true") conditions.push({ email_confirmed_at: { not: null } });
  if (query.email_confirmed === "false") conditions.push({ email_confirmed_at: null });
  if (query.store_id) {
    conditions.push({
      OR: [
        { stores: { some: { id: query.store_id } } },
        { memberships: { some: { store_id: query.store_id } } },
      ],
    });
  }

  const rows = await prisma.user.findMany({
    where: conditions.length ? { AND: conditions } : undefined,
    select: USER_ROW_SELECT,
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, limit);
  const next_cursor = rows.length > limit ? items[items.length - 1].id : null;

  return reply.status(200).send({ items, next_cursor });
}
