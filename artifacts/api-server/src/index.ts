import dns from "node:dns";
import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapKnowledgeGraph } from "./lib/ingredient-graph/seed";

// Force IPv4 for outbound HTTP — Replit's container does not have working IPv6
// connectivity to many external hosts, which causes node fetch to hang on AAAA
// records that never connect.
dns.setDefaultResultOrder("ipv4first");

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
