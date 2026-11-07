import { describe, expect, it } from "vitest";
import { OfflineInspectionQueue, type OfflineInspectionDraft } from "./offline-queue";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const draft = (inspectionId: string): OfflineInspectionDraft => ({
  inspectionId,
  checklist: { exactLocation: true },
  evidence: [{ mediaId: `${inspectionId}-media` }],
  updatedAt: new Date().toISOString(),
});

describe("OfflineInspectionQueue", () => {
  it("deduplicates drafts by inspection and does not flush unsent drafts", async () => {
    const storage = new MemoryStorage();
    const queue = new OfflineInspectionQueue(storage);
    const saved = draft("inspection-1");
    const submitted = { ...saved, notes: "submitted", submitted: true };
    await queue.enqueue(saved);
    await queue.enqueue(submitted);
    const uploads: string[] = [];

    await expect(
      queue.flush(async (entry) => {
        uploads.push(entry.inspectionId);
      }),
    ).resolves.toBe(1);

    expect(uploads).toEqual(["inspection-1"]);
    await expect(queue.list()).resolves.toEqual([]);
  });

  it("does not downgrade a submitted operation when a later draft save arrives", async () => {
    const storage = new MemoryStorage();
    const queue = new OfflineInspectionQueue(storage);
    await queue.enqueue({ ...draft("inspection-1"), submitted: true });
    await queue.enqueue(draft("inspection-1"));
    const uploaded: string[] = [];

    await queue.flush(async (entry) => {
      uploaded.push(entry.inspectionId);
    });

    expect(uploaded).toEqual(["inspection-1"]);
  });

  it("removes only successfully uploaded drafts when a later retry fails", async () => {
    const storage = new MemoryStorage();
    const queue = new OfflineInspectionQueue(storage);
    const first = { ...draft("inspection-1"), submitted: true };
    const second = { ...draft("inspection-2"), submitted: true };
    await queue.enqueue(first);
    await queue.enqueue(second);

    await expect(
      queue.flush(async (entry) => {
        if (entry.inspectionId === "inspection-2") throw new Error("offline");
      }),
    ).rejects.toThrow("offline");

    await expect(queue.list()).resolves.toEqual([second]);
  });
});
