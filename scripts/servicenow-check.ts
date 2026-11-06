// Check that the ServiceNow settings in .env work. Read-only.
//   npm run sn:check
import { loadEnv } from "../src/env";
import { ServiceNowClient, ServiceNowError, configFromEnv } from "../src/servicenow";

loadEnv();
try {
  const config = configFromEnv();
  if (!config) {
    console.error("Missing SN_INSTANCE, SN_USER or SN_PASSWORD in .env (see docs/SERVICENOW-SETUP.md).");
    process.exit(1);
  }
  const sn = new ServiceNowClient(config);
  await sn.ping();
  const fresh = await sn.listNewIncidents(5);
  console.log(`Connected to ${config.instanceUrl} as ${config.user}. New incidents waiting: ${fresh.length}.`);
} catch (err) {
  console.error(err instanceof ServiceNowError ? err.message : err);
  process.exit(1);
}
