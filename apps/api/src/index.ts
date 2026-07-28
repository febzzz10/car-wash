import { app } from "./app";
import { NominatimThrottle } from "./durable-objects/nominatim-throttle";
import { runScheduledMaintenance } from "./services/maintenance";

export { NominatimThrottle };

export default {
  fetch: app.fetch,
  scheduled(_controller, env, context) {
    context.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
