/** Small, dependency-free environment helpers shared by deployable packages. */
export function readEnvironment(
  name: string,
  environment: Record<string, string | undefined> = {},
): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}
