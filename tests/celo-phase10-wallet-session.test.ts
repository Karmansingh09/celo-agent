import { describe, expect, it } from 'vitest';
import {
  normalizeWalletAddress,
  shouldInvalidateWalletSession,
} from '../src/context/auth-wallet';

describe('P1-C: wallet-bound session invalidation', () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const sameOwnerDifferentCase = '0x1111111111111111111111111111111111111111'.toUpperCase();
  const otherWallet = '0x2222222222222222222222222222222222222222';

  it('compares wallet addresses case-insensitively', () => {
    expect(normalizeWalletAddress(sameOwnerDifferentCase)).toBe(owner);
    expect(shouldInvalidateWalletSession(true, owner, sameOwnerDifferentCase)).toBe(false);
  });

  it('invalidates an authenticated session when the wallet switches accounts', () => {
    expect(shouldInvalidateWalletSession(true, owner, otherWallet)).toBe(true);
  });

  it('invalidates an authenticated session when the wallet disconnects', () => {
    expect(shouldInvalidateWalletSession(true, owner, null)).toBe(true);
  });

  it('does not invalidate an already unauthenticated session on reconnect', () => {
    expect(shouldInvalidateWalletSession(false, null, otherWallet)).toBe(false);
  });

  it('invalidates a restored session when the connected wallet does not match its owner', () => {
    expect(shouldInvalidateWalletSession(true, owner, otherWallet)).toBe(true);
    expect(shouldInvalidateWalletSession(true, owner, owner)).toBe(false);
  });
});
