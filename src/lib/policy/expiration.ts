const DEFAULT_POLICY_TTL_MS = 86_400_000;

/** Formats a Unix timestamp for the local datetime-local input control. */
export function formatPolicyExpirationInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Returns the default one-day future expiration used by the create-agent form. */
export function getDefaultPolicyExpirationInput(now: number = Date.now()): string {
  return formatPolicyExpirationInput(now + DEFAULT_POLICY_TTL_MS);
}

/** Converts a datetime-local value to a future Unix timestamp or returns null. */
export function parsePolicyExpirationInput(value: string, now: number = Date.now()): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= now) {
    return null;
  }

  return timestamp;
}
