import { buildApp } from "./app.js";
import { loadEnvironment } from "./config/environment.js";

const environment = loadEnvironment();
const app = await buildApp({ environment });

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "Graceful shutdown started");
  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, "Graceful shutdown failed");
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: environment.host, port: environment.port });
} catch (error) {
  app.log.fatal({ err: error }, "API startup failed");
  process.exitCode = 1;
}
