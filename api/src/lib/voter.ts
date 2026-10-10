const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Returns the voter id if the header is a valid UUID, otherwise null
export function readVoterId(header: unknown): string | null {
  return typeof header === "string" && UUID.test(header) ? header : null;
}