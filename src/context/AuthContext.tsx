'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createSiweMessage } from 'viem/siwe';
import {
  normalizeWalletAddress,
  shouldInvalidateWalletSession,
} from './auth-wallet';

export { normalizeWalletAddress, shouldInvalidateWalletSession } from './auth-wallet';

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
  const walletAddressRef = useRef<string | null>(null);
  const ownerAddressRef = useRef<string | null>(null);
  const authenticatedRef = useRef(false);
  const authEpochRef = useRef(0);
  const providerEventEpochRef = useRef(0);
  const providerAccountsResolvedRef = useRef(false);
  const pendingLogoutRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    walletAddressRef.current = walletAddress;
    ownerAddressRef.current = ownerAddress;
    authenticatedRef.current = authenticated;
  }, [walletAddress, ownerAddress, authenticated]);

  const clearLocalAuth = useCallback(() => {
    authEpochRef.current += 1;
    authenticatedRef.current = false;
    ownerAddressRef.current = null;
    setAuthenticated(false);
    setOwnerAddress(null);
    setError(null);
  }, []);

  // Step 6: Logout using POST /api/auth/logout. The promise is tracked so a
  // sign-in started immediately after wallet invalidation waits for the old
  // server session to be deleted first.
  const logout = useCallback(async (): Promise<void> => {
    clearLocalAuth();

    const previousLogout = pendingLogoutRef.current;
    const operation = (async () => {
      if (previousLogout) {
        await previousLogout;
      }
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch {
        // Local auth state is already cleared; a later session check will fail closed.
      }
    })();

    pendingLogoutRef.current = operation;
    try {
      await operation;
    } finally {
      if (pendingLogoutRef.current === operation) {
        pendingLogoutRef.current = null;
      }
    }
  }, [clearLocalAuth]);

  // Check for window.ethereum on client mount
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined') {
      setHasProvider(true);
      const ethereum = (window as any).ethereum;

      // Listen for account/chain changes. A session is bound to the wallet
      // address that signed SIWE; changing or disconnecting the wallet must
      // never leave the old authenticated owner active.
      const handleAccountsChanged = (accounts: string[], fromProviderEvent = true) => {
        if (fromProviderEvent) {
          providerEventEpochRef.current += 1;
          authEpochRef.current += 1;
        }
        const nextWalletAddress = accounts.length > 0 ? accounts[0] : null;
        walletAddressRef.current = nextWalletAddress;
        setWalletAddress(nextWalletAddress);

        if (
          shouldInvalidateWalletSession(
            authenticatedRef.current,
            ownerAddressRef.current,
            nextWalletAddress
          )
        ) {
          void logout();
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
            providerAccountsResolvedRef.current = true;
            handleAccountsChanged(Array.isArray(accs) ? accs : [], false);
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
  }, [logout]);

  // Step 5: Session Restoration on app load
  const refreshSession = useCallback(async () => {
    const requestEpoch = authEpochRef.current;
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
          if (requestEpoch !== authEpochRef.current) {
            return;
          }

          if (
            providerAccountsResolvedRef.current &&
            shouldInvalidateWalletSession(
              true,
              data.ownerAddress,
              walletAddressRef.current
            )
          ) {
            clearLocalAuth();
            void logout();
            return;
          }

          authenticatedRef.current = true;
          ownerAddressRef.current = data.ownerAddress;
          setAuthenticated(true);
          setOwnerAddress(data.ownerAddress);
          setError(null);
          return;
        }
      }

      if (requestEpoch === authEpochRef.current) {
        authenticatedRef.current = false;
        ownerAddressRef.current = null;
        setAuthenticated(false);
        setOwnerAddress(null);
      }
    } catch {
      if (requestEpoch === authEpochRef.current) {
        authenticatedRef.current = false;
        ownerAddressRef.current = null;
        setAuthenticated(false);
        setOwnerAddress(null);
      }
    } finally {
      setIsLoadingSession(false);
    }
  }, [clearLocalAuth, logout]);

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
      const requestEpoch = authEpochRef.current;
      const providerEventEpoch = providerEventEpochRef.current;
      const accounts: string[] = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        setError('No account returned by wallet.');
        return null;
      }

      const account = accounts[0];
      if (
        requestEpoch !== authEpochRef.current ||
        providerEventEpoch !== providerEventEpochRef.current
      ) {
        return null;
      }
      walletAddressRef.current = account;
      setWalletAddress(account);

      if (
        shouldInvalidateWalletSession(
          authenticatedRef.current,
          ownerAddressRef.current,
          account
        )
      ) {
        void logout();
      }

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
    const initialLogout = pendingLogoutRef.current;
    if (initialLogout) {
      await initialLogout;
    }

    let targetAddress = walletAddressRef.current || walletAddress;

    // Connect wallet first if not already connected
    if (!targetAddress) {
      targetAddress = await connectWallet();
      if (!targetAddress) return false;
    }

    const signInEpoch = authEpochRef.current;
    const providerEventEpoch = providerEventEpochRef.current;
    const isCurrentAttempt = () =>
      signInEpoch === authEpochRef.current &&
      providerEventEpoch === providerEventEpochRef.current &&
      normalizeWalletAddress(walletAddressRef.current) === normalizeWalletAddress(targetAddress);

    const logoutBeforeSignIn = pendingLogoutRef.current;
    if (logoutBeforeSignIn) {
      await logoutBeforeSignIn;
      if (!isCurrentAttempt()) {
        return false;
      }
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
      if (!isCurrentAttempt()) {
        return false;
      }
      const nonce = nonceData.nonce;

      // 2. Read domain, URI, and chain ID
      const domain = window.location.host;
      const uri = window.location.origin;

      const chainHex: string = await ethereum.request({ method: 'eth_chainId' });
      if (!isCurrentAttempt()) {
        return false;
      }
      let currentChainId = parseInt(chainHex, 16);

      // Ensure wallet is switched to Celo Sepolia
      if (currentChainId !== CELO_SEPOLIA_CHAIN_ID) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${CELO_SEPOLIA_CHAIN_ID.toString(16)}` }],
          });
          const updatedHex: string = await ethereum.request({ method: 'eth_chainId' });
          currentChainId = parseInt(updatedHex, 16);
          setChainId(currentChainId);
        } catch (switchErr: any) {
          if (switchErr?.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${CELO_SEPOLIA_CHAIN_ID.toString(16)}`,
                  chainName: 'Celo Sepolia Testnet',
                  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
                  rpcUrls: ['https://forno.celo-sepolia.celo-testnet.org'],
                  blockExplorerUrls: ['https://celo-sepolia.blockscout.com'],
                },
              ],
            });
            const updatedHex: string = await ethereum.request({ method: 'eth_chainId' });
            currentChainId = parseInt(updatedHex, 16);
            setChainId(currentChainId);
          } else if (switchErr?.code === 4001) {
            throw new Error('Please switch your wallet to Celo Sepolia (Chain ID 11142220) to sign in.');
          } else {
            console.warn('Network switch warning:', switchErr);
          }
        }
      }

      if (!isCurrentAttempt()) {
        return false;
      }

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

      if (!isCurrentAttempt()) {
        return false;
      }

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

      if (!isCurrentAttempt()) {
        return false;
      }

      authenticatedRef.current = true;
      ownerAddressRef.current = verifyData.ownerAddress;
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
