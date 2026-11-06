// Load settings from a local .env file if there is one (never committed).
import { existsSync } from "node:fs";

export function loadEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
