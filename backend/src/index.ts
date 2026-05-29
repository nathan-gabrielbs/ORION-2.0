import { startServer } from "./server.js";

// Tiny entry point. Keeping startup separate from server.ts means tests can
// import the wiring code without booting the HTTP server, opening sockets or
// scheduling background pollers.
startServer().catch((err) => {
  console.error("[orion] failed to start server:", err);
  process.exit(1);
});
