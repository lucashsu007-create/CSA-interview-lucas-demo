// Metro for a pnpm workspace.
//
// The default Expo config only watches this package, which is wrong here: the
// screens import `@csa/design-tokens` and `@csa/domain` as TypeScript SOURCE
// (their package.json `main` points at `src/index.ts`, not a build output). Metro
// therefore has to watch and transform files that live outside the project root,
// and it has to be able to resolve modules from the workspace root store as well
// as the local `node_modules` symlink farm pnpm creates.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm symlinks every dependency; following them to their real location in the
// store is what lets a single copy of react be shared with the workspace packages.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
