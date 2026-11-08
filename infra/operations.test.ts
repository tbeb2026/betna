import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const infraDir = resolve(import.meta.dirname);
const readInfra = (name: string) =>
  readFileSync(resolve(infraDir, name), "utf8");

describe("backup and restore operations", () => {
  it("passes the database URL explicitly to pg_dumpall", () => {
    expect(readInfra("backup.sh")).toContain(
      'pg_dumpall --globals-only --dbname="$DATABASE_URL"',
    );
  });

  it("decrypts age artifacts before restore", () => {
    const runbook = readInfra("backup-runbook.md");
    expect(runbook).toContain(
      'age --decrypt --identity="$BACKUP_AGE_IDENTITY"',
    );
    expect(runbook).toContain(
      'psql "$RECOVERY_DATABASE_URL" < "$restore_dir/globals.sql"',
    );
    expect(runbook).toContain('"$restore_dir/betna.dump"');
  });
});

describe("critical browser flow", () => {
  it("submits the inquiry from the browser UI", () => {
    const flow = readFileSync(
      resolve(infraDir, "../apps/web/e2e/critical-flow.spec.ts"),
      "utf8",
    );
    expect(flow).toContain(
      'page.getByRole("button", { name: "Send inquiry" }).click()',
    );
    expect(flow).not.toMatch(/request\.post\([^\n]*\/public\/inquiries/);
  });
});

describe("seed output", () => {
  it("does not print the critical-flow password", () => {
    const seed = readFileSync(
      resolve(infraDir, "../apps/api/prisma/seed-critical-flow.ts"),
      "utf8",
    );
    expect(seed).not.toMatch(/console\.log\([^\n]*password/);
  });
});
