import type { Config } from "./config.js";

const API_BASE = "https://discord.com/api/v10";
const MAX_RETRIES = 3;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Shown in the guild's audit log. */
  reason?: string;
}

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: unknown,
  ) {
    super(`Discord API ${method} ${path} failed with ${status}: ${JSON.stringify(body)}`);
  }
}

export class DiscordClient {
  private channelGuildCache = new Map<string, string | null>();

  constructor(private readonly config: Config) {}

  async request<T = unknown>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(API_BASE + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      Authorization: `Bot ${this.config.token}`,
      "User-Agent": "DiscordBot (discord-mcp, 1.0.0)",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(opts.reason);

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        const waitSec = data.retry_after ?? Number(res.headers.get("retry-after") ?? 1);
        await new Promise((r) => setTimeout(r, Math.ceil(waitSec * 1000) + 50));
        continue;
      }

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      const data = text ? safeJson(text) : undefined;
      if (!res.ok) throw new DiscordApiError(res.status, method, path, data);
      return data as T;
    }
  }

  /** Throws if the guild is outside DISCORD_ALLOWED_GUILD_IDS. */
  assertGuildAllowed(guildId: string): void {
    const allowed = this.config.allowedGuildIds;
    if (allowed && !allowed.has(guildId)) {
      throw new Error(`Guild ${guildId} is not in DISCORD_ALLOWED_GUILD_IDS`);
    }
  }

  isGuildAllowed(guildId: string): boolean {
    return !this.config.allowedGuildIds || this.config.allowedGuildIds.has(guildId);
  }

  /** Resolves the channel's guild and checks it against the allowlist. Returns the guild ID. */
  async assertChannelAllowed(channelId: string): Promise<string> {
    let guildId = this.channelGuildCache.get(channelId);
    if (guildId === undefined) {
      const channel = await this.request<{ guild_id?: string }>("GET", `/channels/${channelId}`);
      guildId = channel.guild_id ?? null;
      this.channelGuildCache.set(channelId, guildId);
    }
    if (!guildId) throw new Error(`Channel ${channelId} does not belong to a guild`);
    this.assertGuildAllowed(guildId);
    return guildId;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
