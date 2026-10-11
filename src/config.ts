import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(projectRoot, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function flag(name: string): boolean {
  return ["1", "true", "yes"].includes((process.env[name] ?? "").trim().toLowerCase());
}

export interface Config {
  token: string;
  allowedGuildIds: Set<string> | null;
  readOnly: boolean;
  allowRawRequests: boolean;
}

export function loadConfig(): Config {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not set (env var or .env in the project root)");
  }
  const ids = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    token,
    allowedGuildIds: ids.length > 0 ? new Set(ids) : null,
    readOnly: flag("DISCORD_READ_ONLY"),
    allowRawRequests: flag("DISCORD_ALLOW_RAW_REQUESTS"),
  };
}
