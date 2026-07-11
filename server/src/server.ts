import { app } from "./app";
import { env } from "./env";
import { prisma } from "./lib/prisma";

app
  .listen({
    host: "0.0.0.0",
    port: env.PORT,
  })
  .then(() => {
    console.log(`HTTP server running on port ${env.PORT}!`);
  })
  .catch((err) => {
    app.log.error({ err }, "Server failed to start");
    // Surface the cause directly — pino-pretty's transport config may strip err details
    console.error("[fatal] Server failed to start:", err);
    process.exit(1);
  });

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "Received shutdown signal, closing server");
  try {
    await app.close();
    await prisma.$disconnect();
  } catch (err) {
    app.log.error({ err }, "Error during shutdown");
    process.exit(1);
  }
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
