export const ModuleDefs: Record<string, { label: string; unlocks: string[] }> = {
  motor:   { label: "Motor",   unlocks: ["motion.*"] },
  scanner: { label: "Scanner", unlocks: ["sense.*"] },
  manip:   { label: "Manipulator", unlocks: ["manip.*"] },
  comms:   { label: "Comms",    unlocks: ["event.broadcast","event.onBroadcast"] }
};

export function allowedKindsFor(mods: string[], allKinds: string[]) {
  const pats = mods.flatMap(m => ModuleDefs[m]?.unlocks ?? []);
  return allKinds.filter(k => pats.some(p => p.endsWith(".*") ? k.startsWith(p.slice(0,-2)) : k === p));
}