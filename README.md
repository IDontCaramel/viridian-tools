# Viridian Origins tools

This repository includes tools for making Viridian Origins datapacks. This guide covers the VS Code extension.

## VS Code extension

The extension helps edit Origins and Apoli datapack files for Viridian Origins on Minecraft 26.3. It reports errors and warnings, suggests valid fields and values, shows field and type docs on hover, and lets you jump between definitions and references.

### Run the extension

The extension isn't on the VS Code Marketplace yet. To run it from this checkout:

1. Install [Node.js 22.18 or later](https://nodejs.org/).
2. Open the `vscode-viridian` folder in VS Code.
3. Open a terminal in that folder and run `npm install`.
4. Press **F5**. VS Code builds the extension and opens a second window with it enabled.
5. In the new window, open a folder that contains a datapack's `pack.mcmeta` file.

Leave the first VS Code window open while you use the extension. It runs from the source in that window.

### Edit a datapack

The extension finds datapacks inside your workspace and checks definitions and references across them. It supports JSON, JSONC, and JSON5 where Viridian accepts those formats.

As you edit origins, layers, powers, badges, and global power sets, the extension reports problems and offers completions and hover docs. Use **Go to Definition** or **Find All References** on supported identifiers to move between files. It reads files without formatting or rewriting them, leaves unknown fields in place, and marks `viridian:` types as Viridian-only.

Open the command palette with **Ctrl+Shift+P** on Windows or Linux, or **Cmd+Shift+P** on macOS:

- **Viridian: New Datapack** creates a Minecraft 26.3 datapack with `pack.mcmeta`.
- **Viridian: New Origin, Layer or Power** creates one of those files in a datapack. You can also choose it from a folder's Explorer context menu.
- **Viridian: Re-index Datapacks** rebuilds the workspace index.
- **Viridian: Open Zipped Datapack** opens a zip for browsing. Zip files are read-only. Extract the pack to edit it.

To add a starter structure, request completion in an empty origin, layer, or power file. Power snippets include a toggle, a key press with cooldown, and a resource bar. Nested action and condition fields offer snippets based on the mod catalog.

The extension indexes zip files in the workspace, including packs wrapped in a folder. It reads them in memory, up to 32 MiB per entry and 128 MiB per archive.

### Change validation settings

In VS Code settings, search for `Viridian`:

| Setting | Default | What it changes |
| --- | --- | --- |
| `viridian.validation.enable` | `true` | Turns diagnostics on or off. |
| `viridian.validation.unknownFields` | `warning` | Sets how fields ignored by the mod are reported. Options are `warning`, `information`, and `off`. |
| `viridian.validation.missingReferences` | `warning` | Sets how unresolved power, origin, layer, and badge references are reported. Options are `warning`, `information`, and `off`. |

The extension may report references to packs outside the workspace as missing. Add those packs to the workspace or change the missing references setting.

## Work on the extension

In `vscode-viridian/`, run `npm run dev` to rebuild the extension as you edit it. Reload the second VS Code window to pick up changes. Run `npm run build` for a production build or `npm test` for type checks, unit tests, and VS Code integration tests.

