export function formatUnknownError(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "Unknown error" };
}
