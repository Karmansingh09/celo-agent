import 'server-only';
import { privateKeyToAccount, PrivateKeyAccount } from 'viem/accounts';
import { Hex, isHex } from 'viem';

/**
 * Validates whether a given string is a valid 32-byte EVM private key in hex format.
 * Expected format: "0x" followed by 64 hexadecimal characters.
 *
 * @param key String to validate
 * @returns boolean
 */
export function isValidPrivateKey(key?: string): key is Hex {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed.startsWith('0x')) return false;
  if (trimmed.length !== 66) return false;
  return isHex(trimmed);
}

/**
 * Retrieves the configured backend agent PrivateKeyAccount.
 * Returns null if AGENT_PRIVATE_KEY is missing, empty, or malformed.
 *
 * SECURITY: Private key operations MUST remain server-side only.
 *
 * @returns PrivateKeyAccount or null
 */
export function getAgentAccount(): PrivateKeyAccount | null {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey || !isValidPrivateKey(privateKey)) {
    return null;
  }
  try {
    return privateKeyToAccount(privateKey.trim() as Hex);
  } catch {
    return null;
  }
}

/**
 * Resolves the public address of the backend agent wallet if configured.
 *
 * @returns Checksummed 0x address string or null
 */
export function getAgentAddress(): string | null {
  const account = getAgentAccount();
  return account ? account.address : null;
}

/**
 * Checks whether the backend agent wallet is properly configured with a valid private key.
 *
 * @returns boolean
 */
export function isAgentConfigured(): boolean {
  return getAgentAccount() !== null;
}
