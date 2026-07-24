import { app } from "./app";
import { runScheduledMaintenance } from "./services/maintenance";

export default {
  fetch: app.fetch,
  scheduled(_controller, env, context) {
    context.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
