const MAX_LENGTH = 2000;

// The message saved on the item and shown in the app.
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'Unknown error').slice(0, MAX_LENGTH);
}
