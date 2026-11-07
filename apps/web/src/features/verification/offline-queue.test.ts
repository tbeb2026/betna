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
  it("removes only successfully uploaded drafts when a later retry fails", async () => {
    const storage = new MemoryStorage();
    const queue = new OfflineInspectionQueue(storage);
    const first = draft("inspection-1");
    const second = draft("inspection-2");
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
