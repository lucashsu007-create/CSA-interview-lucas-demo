const basePath = process.env.NEXT_PUBLIC_CSA_BASE_PATH ?? "";

export function assetPath(path: `/${string}`): string {
  return `${basePath}${path}`;
}
