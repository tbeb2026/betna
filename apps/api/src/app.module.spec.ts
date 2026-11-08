import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
import { InquiriesService } from "./inquiries/inquiries.service";
import { NOTIFICATION_CHANNEL_ADAPTERS } from "./notifications/channel.adapter";

describe("AppModule bootstrap", () => {
  it("resolves Task 10 providers through Nest dependency injection", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(NOTIFICATION_CHANNEL_ADAPTERS)).toHaveLength(4);
    expect(moduleRef.get(InquiriesService)).toBeDefined();
    await moduleRef.close();
  });
});
