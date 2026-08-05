"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession, signOut } from "aws-amplify/auth";

interface AuthState {
  loading: boolean;
  signedIn: boolean;
}

/**
 * Thin wrapper around Amplify's auth state. Handles the common case:
 * "is someone signed in, and give me their ID token to call the API with."
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ loading: true, signedIn: false });

  const checkAuth = useCallback(async () => {
    try {
      await getCurrentUser();
      setState({ loading: false, signedIn: true });
    } catch {
      setState({ loading: false, signedIn: false });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setState({ loading: false, signedIn: false });
  }, []);

  return { ...state, getIdToken, logout, refresh: checkAuth };
}
