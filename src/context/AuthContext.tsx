'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createSiweMessage } from 'viem/siwe';

export interface AuthContextType {
  authenticated: boolean;
  ownerAddress: string | null;
  walletAddress: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isSigning: boolean;
  isLoadingSession: boolean;
  error: string | null;
  hasProvider: boolean;
  connectWallet: () => Promise<string | null>;
  signIn: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Supported Celo chain IDs
export const CELO_SEPOLIA_CHAIN_ID = 11142220;
export const CELO_MAINNET_CHAIN_ID = 42220;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState<boolean>(false);

  // Check for window.ethereum on client mount
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined') {
      setHasProvider(true);
      const ethereum = (window as any).ethereum;

      // Listen for account/chain changes
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setWalletAddress(null);
        } else {
          setWalletAddress(accounts[0]);
        }
      };

      const handleChainChanged = (hexChainId: string) => {
        setChainId(parseInt(hexChainId, 16));
      };

      if (ethereum.on) {
        ethereum.on('accountsChanged', handleAccountsChanged);
        ethereum.on('chainChanged', handleChainChanged);
      }

      // Initial read of current chain if available
      if (ethereum.request) {
        ethereum
          .request({ method: 'eth_chainId' })
          .then((hex: string) => setChainId(parseInt(hex, 16)))
          .catch(() => {});
        ethereum
          .request({ method: 'eth_accounts' })
          .then((accs: string[]) => {
            if (accs && accs.length > 0) {
              setWalletAddress(accs[0]);
            }
          })
          .catch(() => {});
      }

      return () => {
        if (ethereum.removeListener) {
          ethereum.removeListener('accountsChanged', handleAccountsChanged);
          ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    } else {
      setHasProvider(false);
    }
  }, []);

  // Step 5: Session Restoration on app load
  const refreshSession = useCallback(async () => {
    try {
      setIsLoadingSession(true);
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.ownerAddress) {
          setAuthenticated(true);
          setOwnerAddress(data.ownerAddress);
          setError(null);
          return;
        }
      }

      setAuthenticated(false);
      setOwnerAddress(null);
    } catch {
      setAuthenticated(false);
      setOwnerAddress(null);
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Step 2: Browser-Native EIP-1193 Wallet Connection
  const connectWallet = async (): Promise<string | null> => {
    setError(null);
    if (typeof window === 'undefined' || typeof (window as any).ethereum === 'undefined') {
      const msg = 'No Ethereum wallet provider detected. Please install MetaMask, Rabby, or another browser wallet.';
      setError(msg);
      return null;
    }

    try {
      setIsConnecting(true);
      const ethereum = (window as any).ethereum;
      const accounts: string[] = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        setError('No account returned by wallet.');
        return null;
      }

      const account = accounts[0];
      setWalletAddress(account);

      const currentChainHex: string = await ethereum.request({ method: 'eth_chainId' });
      const currentChain = parseInt(currentChainHex, 16);
      setChainId(currentChain);

      return account;
    } catch (err: any) {
      if (err.code === 4001) {
        setError('Connection request rejected by user.');
      } else {
        setError(err.message || 'Failed to connect wallet.');
      }
      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  // Step 3: SIWE Authentication Flow
  const signIn = async (): Promise<boolean> => {
    setError(null);
    let targetAddress = walletAddress;

    // Connect wallet first if not already connected
    if (!targetAddress) {
      targetAddress = await connectWallet();
      if (!targetAddress) return false;
    }

    const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!ethereum) {
      setError('Wallet provider unavailable for signing.');
      return false;
    }

    try {
      setIsSigning(true);

      // 1. Fetch fresh nonce from backend
      const nonceRes = await fetch('/api/auth/nonce');
      if (!nonceRes.ok) {
        throw new Error('Failed to obtain authentication challenge from server.');
      }
      const nonceData = await nonceRes.json();
      if (!nonceData.success || !nonceData.nonce) {
        throw new Error(nonceData.error || 'Server did not return a valid challenge nonce.');
      }
      const nonce = nonceData.nonce;

      // 2. Read domain, URI, and chain ID
      const domain = window.location.host;
      const uri = window.location.origin;

      const chainHex: string = await ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(chainHex, 16);

      // 3. Construct EIP-4361 SIWE message
      const message = createSiweMessage({
        domain,
        address: targetAddress as `0x${string}`,
        statement: 'Sign in to CeloAgent Control Plane',
        uri,
        version: '1',
        chainId: currentChainId,
        nonce,
        issuedAt: new Date(),
      });

      // 4. Request EIP-191 personal signature from wallet
      const signature: string = await ethereum.request({
        method: 'personal_sign',
        params: [message, targetAddress],
      });

      // 5. Submit to backend verify endpoint
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || 'Authentication verification failed on server.');
      }

      setAuthenticated(true);
      setOwnerAddress(verifyData.ownerAddress);
      setError(null);
      return true;
    } catch (err: any) {
      if (err.code === 4001) {
        setError('Signature request was rejected in your wallet.');
      } else {
        setError(err.message || 'SIWE authentication failed.');
      }
      return false;
    } finally {
      setIsSigning(false);
    }
  };

  // Step 6: Logout using POST /api/auth/logout
  const logout = async (): Promise<void> => {
    try {
      setError(null);
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      setAuthenticated(false);
      setOwnerAddress(null);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        ownerAddress,
        walletAddress,
        chainId,
        isConnecting,
        isSigning,
        isLoadingSession,
        error,
        hasProvider,
        connectWallet,
        signIn,
        logout,
        refreshSession,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
