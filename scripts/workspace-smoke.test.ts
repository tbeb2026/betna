import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspacePackages = [
  '@betna/web',
  '@betna/api',
  '@betna/contracts',
  '@betna/ui',
  '@betna/config',
] as const;

describe('Betna workspace aliases', () => {
  it.each(workspacePackages)('resolves %s through the workspace alias', (packageName) => {
    const require = createRequire(import.meta.url);
    const packageManifest = require.resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(readFileSync(packageManifest, 'utf8')) as {
      name?: string;
      private?: boolean;
    };

    expect(packageManifest).toContain('/package.json');
    expect(manifest.name).toBe(packageName);
    expect(manifest.private).toBe(true);
  });

  it('keeps local worktree metadata out of the repository', () => {
    const gitignore = readFileSync(resolve(import.meta.dirname, '../.gitignore'), 'utf8');

    expect(gitignore).toMatch(/^\.worktrees\/$/m);
    expect(gitignore).toMatch(/^\.superpowers\/$/m);
  });
});
