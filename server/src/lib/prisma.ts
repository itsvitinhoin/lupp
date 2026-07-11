import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client"
import { env } from "@/env"

const connectionString = env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined")
}

const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
export const dbSchema = schema ?? "public";

const adapter = new PrismaPg(
  {
    connectionString,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
  },
  schema ? { schema } : undefined,
)

export const prisma = new PrismaClient({ adapter, log: ["error", "warn"] })
