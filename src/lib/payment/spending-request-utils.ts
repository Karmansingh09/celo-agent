import { isAddress } from 'viem';

/**
 * Generates a stable client-side idempotency key scoped to spending requests.
 */
export function generateIdempotencyKey(): string {
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `sim_${Date.now()}_${randomSuffix}`;
}

/**
 * Formats a cUSD decimal string without using parseFloat or Number arithmetic.
 */
export function formatCusdString(val: string): string {
  if (!val) return '$0.00 cUSD';
  const trimmed = val.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return `$${trimmed} cUSD`;
  const [whole, dec = ''] = trimmed.split('.');
  const paddedDec = dec.length === 0 ? '00' : dec.length === 1 ? `${dec}0` : dec;
  return `$${whole}.${paddedDec} cUSD`;
}

/**
 * Validates spending form inputs enforcing financial precision and EVM address rules.
 */
export function validateSpendingForm(
  amount: string,
  recipient: string,
  purpose: string
): { valid: boolean; error: string | null } {
  const trimmedAmount = amount.trim();
  if (!trimmedAmount) {
    return { valid: false, error: 'Amount is required.' };
  }

  if (!/^\d+(\.\d+)?$/.test(trimmedAmount)) {
    return { valid: false, error: 'Amount must be a valid positive decimal number (e.g. "8.50").' };
  }

  const [whole, dec = ''] = trimmedAmount.split('.');
  if (dec.length > 18) {
    return { valid: false, error: 'Amount cannot exceed 18 decimal places.' };
  }

  // Check non-zero without floating-point conversion
  if (whole === '0' && (dec === '' || /^0+$/.test(dec))) {
    return { valid: false, error: 'Amount must be greater than zero.' };
  }

  const trimmedRecipient = recipient.trim();
  if (!trimmedRecipient) {
    return { valid: false, error: 'Recipient address is required.' };
  }

  if (!isAddress(trimmedRecipient)) {
    return { valid: false, error: 'Recipient must be a valid 40-character hex EVM address (0x...).' };
  }

  if (purpose.length > 500) {
    return { valid: false, error: 'Purpose cannot exceed 500 characters.' };
  }

  return { valid: true, error: null };
}
