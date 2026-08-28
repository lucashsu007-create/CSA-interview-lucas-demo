import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_CSA_BASE_PATH ?? "";
const isStaticExport = process.env.CSA_STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  transpilePackages: ["@csa/design-tokens", "@csa/motion"],
  typedRoutes: true,
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport ? { images: { unoptimized: true }, output: "export" } : {}),
};

export default nextConfig;
