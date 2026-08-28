/**
 * Where the JSON API lives.
 *
 * Resolution order, and the reason for each step:
 *
 *   1. `EXPO_PUBLIC_API_BASE_URL` — the explicit answer. Expo inlines
 *      `EXPO_PUBLIC_*` at bundle time, so this is set in `.env.local` (see
 *      `.env.example`) or in the environment of whoever starts Metro.
 *   2. The host Metro is already being served from, with the portal's port
 *      substituted. A phone running the app over LAN cannot reach `localhost` —
 *      that is the phone. Deriving the host from the connection the app already
 *      has is what makes the demo work on a real device without anyone editing
 *      a file, and it keeps a machine-specific address out of the source.
 *   3. On web, the browser's own hostname, same substitution.
 *
 * There is no hardcoded IP anywhere in this file and there must never be one.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

/** The port `next dev` uses in `apps/admin`. */
const PORTAL_DEV_PORT = 3000;

function hostFromMetro(): string | null {
  // `hostUri` is `192.168.1.20:8081` in dev and absent in a production build.
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  return host && host.length > 0 ? host : null;
}

function hostFromBrowser(): string | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined") return null;
  const host = window.location?.hostname;
  return host && host.length > 0 ? host : null;
}

function resolveApiBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = hostFromMetro() ?? hostFromBrowser();
  if (!host) return null;

  return `http://${host}:${PORTAL_DEV_PORT}`;
}

/**
 * Null when nothing could be resolved — a production build with no
 * `EXPO_PUBLIC_API_BASE_URL`. The screens render that as a configuration
 * message rather than an infinite spinner or a fabricated empty list.
 */
export const API_BASE_URL: string | null = resolveApiBaseUrl();

/**
 * Contract section 7. Four seeded, fictional identities.
 *
 * Only the address and the one-line description live here, both straight from
 * the contract. Names, roles and membership state are NOT copied from the seed:
 * they are read back from `/api/me` after signing in, so this screen can never
 * disagree with the database about who someone is.
 */
export interface DemoIdentity {
  readonly email: string;
  readonly summary: string;
}

export const DEMO_IDENTITIES: readonly DemoIdentity[] = [
  { email: "member@demo.local", summary: "Active general membership" },
  { email: "nonmember@demo.local", summary: "Registered user, no active membership" },
  { email: "admin@demo.local", summary: "Committee admin" },
  { email: "staff@demo.local", summary: "Door scanner volunteer" },
];

/** Shown wherever someone could mistake this for a real CSA product. */
export const PROTOTYPE_NOTICE =
  "Concept prototype. Not an official CSA product. Every person, event and price here is fictional.";
