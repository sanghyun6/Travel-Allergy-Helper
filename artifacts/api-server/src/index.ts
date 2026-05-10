import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapKnowledgeGraph } from "./lib/ingredient-graph/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run knowledge-graph bootstrap in the background. It's idempotent and
  // only does work on a fresh database. We don't await it so the server
  // starts serving immediately.
  bootstrapKnowledgeGraph().catch((bootErr) => {
    logger.error({ err: bootErr }, "Knowledge-graph bootstrap failed");
  });
});
