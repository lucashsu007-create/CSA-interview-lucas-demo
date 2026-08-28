/**
 * Token storage.
 *
 * The session token lives in `expo-secure-store` — Keychain on iOS, the
 * EncryptedSharedPreferences-backed store on Android. That is the whole point of
 * the dependency and it is what the app actually ships with.
 *
 * `expo-secure-store` has no web implementation, and calling it there throws.
 * The web target exists in this repo only as a fast render check for the
 * screens, so it falls back to `localStorage` — which is NOT secure storage and
 * is why the fallback is confined to `Platform.OS === 'web'` rather than being a
 * general "if unavailable" branch. A native build never reaches it.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_TOKEN_KEY = "csa.session.token";

const isWeb = Platform.OS === "web";

function webStorage(): Storage | null {
  if (typeof globalThis === "undefined") return null;
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  return storage ?? null;
}

export async function readSessionToken(): Promise<string | null> {
  if (isWeb) return webStorage()?.getItem(SESSION_TOKEN_KEY) ?? null;
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function writeSessionToken(token: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(SESSION_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(SESSION_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
