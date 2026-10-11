import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "./config.js";
import type { DiscordClient } from "./discord.js";

export interface ToolContext {
  server: McpServer;
  discord: DiscordClient;
  config: Config;
}

type Shape = z.ZodRawShape;

interface ToolDef<S extends Shape> {
  description: string;
  input: S;
  /** Read-only tools are registered even when DISCORD_READ_ONLY=true. */
  readOnly?: boolean;
  destructive?: boolean;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

/** Registers a tool, skipping write tools in read-only mode and turning thrown errors into tool errors. */
export function defineTool<S extends Shape>(ctx: ToolContext, name: string, def: ToolDef<S>): void {
  if (ctx.config.readOnly && !def.readOnly) return;
  const annotations: ToolAnnotations = {
    readOnlyHint: def.readOnly ?? false,
    destructiveHint: def.destructive ?? false,
    openWorldHint: true,
  };
  ctx.server.registerTool(
    name,
    { description: def.description, inputSchema: def.input, annotations },
    // The SDK's generic callback type does not narrow well through this wrapper.
    (async (args: z.infer<z.ZodObject<S>>): Promise<CallToolResult> => {
      try {
        return json(await def.handler(args));
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] };
      }
    }) as never,
  );
}

export function json(value: unknown): CallToolResult {
  const text = value === undefined ? "OK" : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

/** Drops undefined keys so PATCH bodies only contain fields the caller set. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const snowflake = z.string().regex(/^\d{17,20}$/, "Discord snowflake ID");
export const reason = z.string().max(512).optional().describe("Audit log reason");

/** "#5865F2" / "5865F2" -> 5793266 */
export function parseColor(hex: string | undefined): number | undefined {
  if (hex === undefined) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid color "${hex}", expected hex like #5865F2`);
  return parseInt(m[1]!, 16);
}

export function formatColor(color: number): string | null {
  return color === 0 ? null : `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
}
