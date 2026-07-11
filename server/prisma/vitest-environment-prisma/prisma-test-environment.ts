import 'dotenv/config'

import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import type { Environment } from 'vitest/environments'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

function generateDatabaseURL(schema?: string) {
  const schemaValue = schema ?? randomUUID()
  // Derive the connection from the developer's configured DATABASE_URL (loaded
  // via dotenv/config above) so tests run against whatever local Postgres is set
  // up, falling back to the docker-compose defaults. Only the schema is swapped
  // for an ephemeral, per-file UUID schema.
  const base =
    process.env.DATABASE_URL ?? 'postgres://docker:docker@localhost:5433/lupp'
  const url = new URL(base)
  url.searchParams.set('schema', schemaValue)
  return url.toString()
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function isLocalDatabase(databaseURL: string) {
  try {
    return LOCAL_HOSTS.has(new URL(databaseURL).hostname)
  } catch {
    return false
  }
}

export default <Environment>{
  name: 'prisma',
  viteEnvironment: 'ssr',

  async setup() {
    const schema = randomUUID()
    const databaseURL = generateDatabaseURL(schema)

    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = databaseURL
    process.env.DOTENV_CONFIG_QUIET = "true"
    // Silence Fastify's request logging during tests (consumed by app.ts).
    process.env.LOG_LEVEL = 'silent'

    // `prisma db push --force-reset` is blocked by Prisma's AI-safety guard
    // unless PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION is set. The reset only
    // ever runs against an ephemeral, UUID-named schema in the *local* Docker
    // Postgres, so auto-grant consent when the DB host is local. Never auto-grant
    // for remote hosts — those must opt in explicitly.
    const env = { ...process.env }
    if (isLocalDatabase(databaseURL) && !env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION) {
      env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION =
        'Automated test setup: force-reset of an ephemeral schema on local Postgres.'
    }

    // Silence Prisma's chatty db push output (config/schema/datasource banners)
    // so test runs only show route logging and errors. On failure, replay the
    // captured output so the error is still diagnosable.
    try {
      execSync('npx prisma db push --force-reset', { stdio: 'pipe', env })
    } catch (error) {
      const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer }
      if (stdout?.length) process.stdout.write(stdout)
      if (stderr?.length) process.stderr.write(stderr)
      throw error
    }

    const adapter = new PrismaPg(
      { connectionString: databaseURL },
      { schema },
    );
    const prisma = new PrismaClient({ adapter });

    return {
      async teardown() {
        await prisma.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );

        await prisma.$disconnect();
      },
    };
  },
}
