import { prisma } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma/client";

const DEFAULT_BATCH_SIZE = 50;

/**
 * Runs prepared prisma operations in chunked transactions instead of one
 * awaited round trip per row. The platform product syncs upsert hundreds of
 * products/variants per run and the per-row awaits dominate their runtime;
 * batching cuts that to one round trip per chunk. A failing chunk rolls back
 * only that chunk (syncs are retried wholesale anyway).
 */
export async function runInBatches<T>(
  operations: Prisma.PrismaPromise<T>[],
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  for (let start = 0; start < operations.length; start += batchSize) {
    await prisma.$transaction(operations.slice(start, start + batchSize));
  }
}
