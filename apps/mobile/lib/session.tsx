/**
 * Who the app is acting as.
 *
 * Three states, and the middle one is the point: `guest` is a first-class state,
 * not a failure to sign in. A visitor browses the events list, opens an event
 * and reads both prices without ever choosing an identity. Only registering
 * needs one. The API agrees — an unauthenticated read returns the published
 * events, because `current_app_user_id()` resolves to NULL and RLS shows exactly
 * those.
 *
 * The token is minted by `POST /api/session`, stored in `expo-secure-store`, and
 * sent as `Authorization: Bearer` on every later call. It is never in a URL and
 * never logged.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { ApiError, createSession, deleteSession, getMe, type Me } from "./api";
import { clearSessionToken, readSessionToken, writeSessionToken } from "./secure-storage";

export type SessionStatus = "restoring" | "guest" | "signed-in";

export interface SessionValue {
  readonly status: SessionStatus;
  /** Null unless `status === 'signed-in'`. */
  readonly token: string | null;
  /** Null unless `status === 'signed-in'`. */
  readonly me: Me | null;
  /** True while a `signIn` or `signOut` is in flight. */
  readonly busy: boolean;
  /** The last sign-in failure, in words a person can act on. Cleared on retry. */
  readonly error: string | null;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Re-reads `/api/me` — after registering, when membership state may matter. */
  refresh(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("restoring");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Restore on launch. A stored token that the portal no longer accepts is
  // discarded rather than surfaced as an error: the correct outcome of "your
  // session expired while the app was closed" is a guest, not an error screen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readSessionToken();
      if (cancelled) return;
      if (!stored) {
        setStatus("guest");
        return;
      }
      try {
        const identity = await getMe(stored);
        if (cancelled) return;
        setToken(stored);
        setMe(identity);
        setStatus("signed-in");
      } catch {
        if (cancelled) return;
        await clearSessionToken();
        setStatus("guest");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string) => {
    setBusy(true);
    setError(null);
    try {
      const issued = await createSession(email);
      const identity = await getMe(issued);
      await writeSessionToken(issued);
      if (!mounted.current) return;
      setToken(issued);
      setMe(identity);
      setStatus("signed-in");
    } catch (caught) {
      if (!mounted.current) return;
      setError(
        caught instanceof ApiError ? caught.message : "Could not sign in with that identity.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    const current = token;
    // Local state is cleared whatever the portal says. A sign-out that fails
    // because the network is down but leaves the app looking signed in is worse
    // than a stale server-side session in a prototype with no real credentials.
    try {
      await deleteSession(current);
    } catch {
      /* ignored deliberately — see above */
    }
    await clearSessionToken();
    if (!mounted.current) return;
    setToken(null);
    setMe(null);
    setStatus("guest");
    setBusy(false);
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const identity = await getMe(token);
      if (mounted.current) setMe(identity);
    } catch {
      /* a refresh failure leaves the last known identity in place */
    }
  }, [token]);

  const value = useMemo<SessionValue>(
    () => ({ status, token, me, busy, error, signIn, signOut, refresh }),
    [status, token, me, busy, error, signIn, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
