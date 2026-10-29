import { runTests } from "@vscode/test-electron";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, cp, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(path.join(root, "../.it-"));
try {
  const workspace = path.join(temporary, "workspace");
  await cp(path.join(root, "test/fixtures/pack"), path.join(workspace, "pack"), { recursive: true });
  await writeFile(path.join(workspace, "archive.zip"), zipSync({
    "nested/pack.mcmeta": strToU8('{}'),
    "nested/data/zipped/powers/test.json": strToU8('{"type":"apoli:dummy"}'),
    "nested/data/zipped/origins/test.json": strToU8('{"powers":["zipped:test"]}'),
  }));
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
    extensionTestsPath: path.join(root, "dist/test/suite.cjs"),
    launchArgs: [workspace, "--disable-extensions", "--disable-extension=github.copilot-chat", "--disable-extension=github.copilot", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", `--user-data-dir=${path.join(temporary, "u")}`],
  });
} finally { await rm(temporary, { recursive: true, force: true }); }
