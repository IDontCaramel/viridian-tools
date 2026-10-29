// bundles the extension (and the integration tests with --tests) into dist/
import * as esbuild from "esbuild";

const args = new Set(process.argv.slice(2));
const production = args.has("--production");

const common = {
  bundle: true,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

const builds = [
  { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.cjs" },
];

if (args.has("--tests")) {
  builds.push({
    ...common,
    entryPoints: ["test/integration/suite.ts"],
    outfile: "dist/test/suite.cjs",
    external: ["vscode", "mocha"],
  });
}

if (args.has("--watch")) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
