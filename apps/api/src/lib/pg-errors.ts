const UNIQUE_VIOLATION = '23505';

// Drizzle wraps driver errors, so the Postgres error code can be on the error or on its cause.
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
