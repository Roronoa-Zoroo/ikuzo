export function escapeRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
