/**
 * helloWorld.test.ts
 *
 * Jest test suite for `src/cli/commands/helloWorld.ts`.
 *
 * Covers:
 *   - `createHelloWorldFile` – directory creation, file existence handling,
 *     overwrite logic and content correctness.
 *   - `registerHelloWorldCommand` – command registration, option parsing,
 *     success & error handling, console output and exit‑code behaviour.
 */

import { Command } from 'commander';
import * as path from 'path';
import * as process from 'process';

// ---------------------------------------------------------------------------
// Mock the `fs` module – only the `promises` API that is used in the code.
// ---------------------------------------------------------------------------
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
  },
  constants: { F_OK: 0 },
}));

import * as fs from 'fs'; // after the mock
import {
  createHelloWorldFile,
  registerHelloWorldCommand,
} from './helloWorld';

// ---------------------------------------------------------------------------
// Helper to reset all mocks & process state between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  // Reset the exit code that may have been set by a previous test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).exitCode = undefined;
});

describe('createHelloWorldFile', () => {
  const targetPath = '/tmp/some/dir/hello-world.md';
  const targetDir = path.dirname(targetPath);
  const content = 'hello world';

  test('creates directory (recursive) and writes the file when it does not exist', async () => {
    // `access` should reject → file does not exist.
    (fs.promises.access as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

    await createHelloWorldFile(targetPath, false);

    // Directory creation
    expect(fs.promises.mkdir).toHaveBeenCalledWith(targetDir, {
      recursive: true,
    });

    // No attempt to read the file before writing – `access` was called.
    expect(fs.promises.access).toHaveBeenCalledWith(
      targetPath,
      fs.constants.F_OK
    );

    // File write with exact content
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      targetPath,
      content,
      { encoding: 'utf8' }
    );
  });

  test('throws when the file already exists and force is false', async () => {
    // `access` resolves → file exists.
    (fs.promises.access as jest.Mock).mockResolvedValueOnce(undefined);

    await expect(createHelloWorldFile(targetPath, false)).rejects.toThrow(
      `File already exists at ${targetPath}. Use --force to overwrite.`
    );

    // Directory is still ensured.
    expect(fs.promises.mkdir).toHaveBeenCalledWith(targetDir, {
      recursive: true,
    });

    // No write should happen.
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  test('overwrites the existing file when force is true', async () => {
    // `access` resolves → file exists.
    (fs.promises.access as jest.Mock).mockResolvedValueOnce(undefined);

    await createHelloWorldFile(targetPath, true);

    // Directory creation
    expect(fs.promises.mkdir).toHaveBeenCalledWith(targetDir, {
      recursive: true,
    });

    // File write should happen despite existence.
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      targetPath,
      content,
      { encoding: 'utf8' }
    );
  });
});

describe('registerHelloWorldCommand', () => {
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('registers command and calls createHelloWorldFile with defaults', async () => {
    const program = new Command();
    registerHelloWorldCommand(program);

    // Spy on the implementation
    const createSpy = jest
      .spyOn(require('./helloWorld'), 'createHelloWorldFile')
      .mockResolvedValueOnce(undefined);

    // Simulate CLI call: `mycli hello-world`
    await program.parseAsync(['node', 'script', 'hello-world'], {
      from: 'user',
    });

    const expectedPath = path.resolve(process.cwd(), 'hello-world.md');

    expect(createSpy).toHaveBeenCalledWith(expectedPath, false);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Created ${expectedPath}`);
    // No explicit exit code on success
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((process as any).exitCode).toBeUndefined();

    createSpy.mockRestore();
  });

  test('passes custom name, path and force flag to createHelloWorldFile', async () => {
    const program = new Command();
    registerHelloWorldCommand(program);

    const createSpy = jest
      .spyOn(require('./helloWorld'), 'createHelloWorldFile')
      .mockResolvedValueOnce(undefined);

    const customDir = '/custom/dir';
    const customFile = 'myfile.md';

    await program.parseAsync(
      ['node', 'script', 'hello-world', '-n', customFile, '-p', customDir, '-f'],
      { from: 'user' }
    );

    const expectedPath = path.resolve(customDir, customFile);
    expect(createSpy).toHaveBeenCalledWith(expectedPath, true);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Created ${expectedPath}`);

    createSpy.mockRestore();
  });

  test('handles errors from createHelloWorldFile and sets exit code to 1', async () => {
    const program = new Command();
    registerHelloWorldCommand(program);

    const errorMessage = 'simulated failure';
    const createSpy = jest
      .spyOn(require('./helloWorld'), 'createHelloWorldFile')
      .mockRejectedValueOnce(new Error(errorMessage));

    await program.parseAsync(
      ['node', 'script', 'hello-world', '-f'],
      { from: 'user' }
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error: ${errorMessage}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((process as any).exitCode).toBe(1);

    createSpy.mockRestore();
  });
});