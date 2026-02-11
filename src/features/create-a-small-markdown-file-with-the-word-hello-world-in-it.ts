#!/usr/bin/env node
/**
 * helloWorld.ts
 *
 * CLI command that creates a minimal Markdown file containing the exact
 * string `hello world`. The command can be invoked directly via the
 * project's main entry point (e.g. `mycli hello-world`) or registered
 * in the CLI command registry.
 *
 * Supported options:
 *   -n, --name <filename>   Custom file name (default: hello-world.md)
 *   -p, --path <dir>        Target directory (default: current working dir)
 *   -f, --force             Overwrite an existing file
 *
 * Exit codes:
 *   0 – success (implicit when the process finishes without error)
 *   1 – error (e.g. file exists without --force, invalid path, etc.)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';

/**
 * Writes the exact string `hello world` (UTF‑8, no trailing newline)
 * to the specified file.
 *
 * @param targetPath Full absolute path to the file.
 * @param force      Whether to overwrite an existing file.
 * @throws If the file already exists and `force` is false.
 */
export async function createHelloWorldFile(
  targetPath: string,
  force: boolean
): Promise<void> {
  // Ensure the target directory exists (create recursively if needed)
  const dir = path.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true });

  // Determine whether a file already exists at the target location
  let fileExists = false;
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    fileExists = true;
  } catch {
    // No existing file – nothing to do
  }

  if (fileExists && !force) {
    throw new Error(
      `File already exists at ${targetPath}. Use --force to overwrite.`
    );
  }

  // Write the exact content without a trailing newline
  const content = 'hello world';
  await fs.promises.writeFile(targetPath, content, { encoding: 'utf8' });
}

/**
 * Registers the `hello-world` command with a Commander instance.
 *
 * @param program The root Commander program (or a sub‑command container).
 */
export function registerHelloWorldCommand(program: Command): void {
  program
    .command('hello-world')
    .description(
      'Create a minimal Markdown file containing the text "hello world".'
    )
    .option(
      '-n, --name <filename>',
      'Custom file name (default: hello-world.md)',
      'hello-world.md'
    )
    .option(
      '-p, --path <dir>',
      'Target directory (default: current working directory)',
      process.cwd()
    )
    .option('-f, --force', 'Overwrite the file if it already exists', false)
    .action(async (options) => {
      // Destructure while avoiding a name clash with the imported `path` module
      const {
        name,
        path: targetDir,
        force,
      } = options as { name: string; path: string; force: boolean };

      // Resolve the absolute file path
      const targetPath = path.resolve(targetDir, name);

      try {
        await createHelloWorldFile(targetPath, force);
        console.log(`Created ${targetPath}`);
        // Implicit success exit code (0) – no explicit process.exit needed
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
        // Set a non‑zero exit code; the process will terminate after the handler
        process.exitCode = 1;
      }
    });
}

/* -------------------------------------------------------------------------
 * If this file is executed directly (e.g. `node src/cli/commands/helloWorld.ts`)
 * we spin up a tiny Commander instance to make the command usable in isolation.
 * ------------------------------------------------------------------------- */
if (require.main === module) {
  const program = new Command();
  registerHelloWorldCommand(program);
  program.parse(process.argv);
}