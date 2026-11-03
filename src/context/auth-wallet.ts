export function normalizeWalletAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') {
    return null;
  }
  return address.trim().toLowerCase() || null;
}

/** Returns whether a wallet event must invalidate the authenticated session. */
export function shouldInvalidateWalletSession(
  authenticated: boolean,
  sessionOwnerAddress: string | null,
  nextWalletAddress: string | null
): boolean {
  if (!authenticated) {
    return false;
  }

  const sessionOwner = normalizeWalletAddress(sessionOwnerAddress);
  const nextWallet = normalizeWalletAddress(nextWalletAddress);
  return nextWallet === null || sessionOwner === null || sessionOwner !== nextWallet;
}
