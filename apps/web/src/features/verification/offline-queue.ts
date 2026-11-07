export type OfflineInspectionDraft = {
  inspectionId: string;
  checklist: Record<string, unknown>;
  evidence: Array<{
    mediaId?: string;
    file?: string;
    fileName?: string;
    contentType?: string;
    sizeBytes?: number;
  }>;
  requestKey?: string;
  notes?: string;
  submitted?: boolean;
  updatedAt: string;
};

type QueueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type EncryptedEntry = { iv: string; data: string };

const QUEUE_KEY = "betna:verification:offline-queue";
const KEY_KEY = "betna:verification:offline-key";

function storageOrDefault(storage?: QueueStorage): QueueStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(storage: QueueStorage) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle)
    throw new Error("Encrypted offline storage is unavailable");
  const saved = storage.getItem(KEY_KEY);
  if (saved)
    return cryptoApi.subtle.importKey(
      "jwk",
      JSON.parse(saved),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  const key = await cryptoApi.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  storage.setItem(
    KEY_KEY,
    JSON.stringify(await cryptoApi.subtle.exportKey("jwk", key)),
  );
  return key;
}

export class OfflineInspectionQueue {
  constructor(private readonly storage?: QueueStorage) {}

  async enqueue(draft: OfflineInspectionDraft) {
    const storage = storageOrDefault(this.storage);
    if (!storage) return;
    const key = await encryptionKey(storage);
    const queue: EncryptedEntry[] = [];
    let replacement = draft;
    for (const item of this.readEncrypted(storage)) {
      try {
        const existing = await this.decrypt(item, key);
        if (existing.inspectionId !== draft.inspectionId) {
          queue.push(item);
        } else if (existing.submitted) {
          replacement = { ...draft, submitted: true };
        }
      } catch {
        // Corrupt entries cannot be retried and should not block this draft.
      }
    }
    queue.push(await this.encrypt(replacement, key));
    storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  async list(): Promise<OfflineInspectionDraft[]> {
    const storage = storageOrDefault(this.storage);
    if (!storage) return [];
    const key = await encryptionKey(storage);
    const drafts: OfflineInspectionDraft[] = [];
    for (const item of this.readEncrypted(storage)) {
      try {
        drafts.push(await this.decrypt(item, key));
      } catch {
        // A corrupt entry is never returned to the form.
      }
    }
    return drafts;
  }

  async clear() {
    const storage = storageOrDefault(this.storage);
    storage?.removeItem(QUEUE_KEY);
  }

  async flush(
    upload: (
      draft: OfflineInspectionDraft,
      update: (draft: OfflineInspectionDraft) => Promise<void>,
    ) => Promise<void>,
  ) {
    const storage = storageOrDefault(this.storage);
    if (!storage) return 0;
    const submitted = (await this.list()).filter((draft) => draft.submitted);
    for (const draft of submitted) {
      // Updates made after each media upload are encrypted before the queue
      // entry is removed, so a later failure resumes without re-uploading.
      await upload(draft, async (updated) => {
        await this.enqueue({ ...updated, submitted: true });
      });
      await this.remove(draft.inspectionId);
    }
    return submitted.length;
  }

  private readEncrypted(
    storage: QueueStorage,
  ): EncryptedEntry[] {
    try {
      const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async decrypt(
    item: EncryptedEntry,
    key: CryptoKey,
  ): Promise<OfflineInspectionDraft> {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(item.iv) },
      key,
      base64ToBytes(item.data),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  private async encrypt(
    draft: OfflineInspectionDraft,
    key: CryptoKey,
  ): Promise<EncryptedEntry> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(draft));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    );
    return {
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  private async remove(inspectionId: string) {
    const storage = storageOrDefault(this.storage);
    if (!storage) return;
    const key = await encryptionKey(storage);
    const retained: EncryptedEntry[] = [];
    for (const item of this.readEncrypted(storage)) {
      try {
        const draft = await this.decrypt(item, key);
        if (draft.inspectionId !== inspectionId) retained.push(item);
      } catch {
        // Drop corrupt entries while compacting the queue.
      }
    }
    storage.setItem(QUEUE_KEY, JSON.stringify(retained));
  }
}
