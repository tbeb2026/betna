export type OfflineInspectionDraft = {
  inspectionId: string;
  checklist: Record<string, unknown>;
  evidence: Array<{ mediaId: string; file?: string }>;
  notes?: string;
  submitted?: boolean;
  updatedAt: string;
};

type QueueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(draft));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    );
    const queue = this.readEncrypted(storage);
    queue.push({
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(ciphertext)),
    });
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

  async flush(upload: (draft: OfflineInspectionDraft) => Promise<void>) {
    const storage = storageOrDefault(this.storage);
    if (!storage) return 0;
    const key = await encryptionKey(storage);
    let uploaded = 0;
    while (true) {
      const queue = this.readEncrypted(storage);
      if (!queue.length) return uploaded;

      let draft: OfflineInspectionDraft;
      try {
        draft = await this.decrypt(queue[0], key);
      } catch {
        // Drop corrupt entries so they cannot block valid drafts behind them.
        queue.shift();
        storage.setItem(QUEUE_KEY, JSON.stringify(queue));
        continue;
      }

      // Remove an entry only after its upload succeeds. A failed upload leaves
      // it at the head of the queue for the next online retry.
      await upload(draft);
      queue.shift();
      storage.setItem(QUEUE_KEY, JSON.stringify(queue));
      uploaded += 1;
    }
  }

  private readEncrypted(
    storage: QueueStorage,
  ): Array<{ iv: string; data: string }> {
    try {
      const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async decrypt(
    item: { iv: string; data: string },
    key: CryptoKey,
  ): Promise<OfflineInspectionDraft> {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(item.iv) },
      key,
      base64ToBytes(item.data),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }
}
