import type { NextConfig } from "next";

/**
 * The @csa/* workspace packages ship TypeScript SOURCE with no build step —
 * their `exports` point straight at `./src/*.ts`. Next has to compile them the
 * same way it compiles this app, so every one of them is listed here. Adding a
 * workspace package to package.json without adding it here fails at the first
 * import with "Unexpected token 'export'".
 */
const nextConfig: NextConfig = {
  transpilePackages: [
    "@csa/api-client",
    "@csa/design-tokens",
    "@csa/domain",
    "@csa/motion",
    "@csa/validation",
  ],

  /**
   * `postgres` opens real sockets and is server-only. Keeping it external means
   * the bundler never tries to trace it into a client chunk, which is also the
   * mechanism that guarantees a database credential cannot reach the browser.
   */
  serverExternalPackages: ["postgres"],

  typedRoutes: true,
};

export default nextConfig;
