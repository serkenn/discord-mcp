import { PermissionFlagsBits } from "discord-api-types/v10";

export const PERMISSION_NAMES = Object.keys(PermissionFlagsBits) as (keyof typeof PermissionFlagsBits)[];

const lookup = new Map(PERMISSION_NAMES.map((name) => [name.toLowerCase(), PermissionFlagsBits[name]]));

/** Converts permission names (e.g. "ViewChannel", case-insensitive) to a bitfield string. */
export function toBitfield(names: string[]): string {
  let bits = 0n;
  const unknown: string[] = [];
  for (const name of names) {
    const bit = lookup.get(name.replace(/[\s_]/g, "").toLowerCase());
    if (bit === undefined) unknown.push(name);
    else bits |= bit;
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown permission name(s): ${unknown.join(", ")}. Use list_permission_names.`);
  }
  return bits.toString();
}

/** Converts a bitfield string to permission names. */
export function fromBitfield(bitfield: string | undefined): string[] {
  if (!bitfield) return [];
  const bits = BigInt(bitfield);
  return PERMISSION_NAMES.filter((name) => (bits & PermissionFlagsBits[name]) !== 0n);
}
