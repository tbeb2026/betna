import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seed } from "./seed";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run apps/api/prisma/currency-integrity.test.ts");
}

describe("property currency integrity triggers", () => {
  const prisma = new PrismaClient();
  const ids = {
    owner: randomUUID(),
    property: randomUUID(),
    offering: randomUUID(),
    inquiry: randomUUID(),
    conversion: randomUUID(),
    commission: randomUUID(),
  };
  let ugandaCountryId: string;
  let kenyaCountryId: string;
  let kampalaCityId: string;
  let neighborhoodId: string;

  beforeAll(async () => {
    await seed(prisma);
    const uganda = await prisma.country.findUniqueOrThrow({ where: { code: "UG" } });
    const kenya = await prisma.country.findUniqueOrThrow({ where: { code: "KE" } });
    const city = await prisma.city.findUniqueOrThrow({ where: { countryId_slug: { countryId: uganda.id, slug: "kampala" } } });
    ugandaCountryId = uganda.id;
    kenyaCountryId = kenya.id;
    kampalaCityId = city.id;
    const neighborhoodRecord = await prisma.neighborhood.findFirstOrThrow({ where: { cityId: kampalaCityId } });
    neighborhoodId = neighborhoodRecord.id;

    await prisma.user.create({ data: { id: ids.owner, firstName: "Currency", lastName: "Fixture" } });
    await prisma.property.create({
      data: {
        id: ids.property,
        ownerId: ids.owner,
        countryId: ugandaCountryId,
        cityId: kampalaCityId,
        neighborhoodId,
        title: "Currency integrity fixture",
        slug: `currency-integrity-${ids.property}`,
        description: "Database trigger fixture",
        category: "residential",
        publicLocationLabel: "Kampala",
        publicLatitude: -0.3476,
        publicLongitude: 32.5825,
      },
    });
  });

  afterAll(async () => {
    await prisma.commission.deleteMany({ where: { id: ids.commission } });
    await prisma.conversion.deleteMany({ where: { id: ids.conversion } });
    await prisma.inquiry.deleteMany({ where: { id: ids.inquiry } });
    await prisma.offering.deleteMany({ where: { id: ids.offering } });
    await prisma.property.deleteMany({ where: { id: ids.property } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  it("rejects direct SQL currency mismatches for offerings, conversions, and commissions", async () => {
    await expect(prisma.$executeRaw`
      INSERT INTO "Offering" ("id", "propertyId", "mode", "currency", "basePrice")
      VALUES (${randomUUID()}::uuid, ${ids.property}::uuid, 'SHORT_STAY'::"RentalMode", 'KES', 100)
    `).rejects.toThrow(/Offering.*currency.*UGX/i);

    await prisma.offering.create({
      data: { id: ids.offering, propertyId: ids.property, mode: "SHORT_STAY", currency: "UGX", basePrice: 100 },
    });
    await expect(prisma.$executeRaw`
      UPDATE "Offering" SET "currency" = 'KES' WHERE "id" = ${ids.offering}::uuid
    `).rejects.toThrow(/Offering.*currency.*UGX/i);

    await prisma.inquiry.create({
      data: {
        id: ids.inquiry,
        reference: `CUR-${ids.inquiry.slice(0, 8)}`,
        propertyId: ids.property,
        offeringId: ids.offering,
        guestName: "Currency Guest",
        guestEmail: "currency-fixture@example.test",
        guestPhone: "+256700000001",
        message: "Currency trigger fixture",
      },
    });
    await expect(prisma.$executeRaw`
      INSERT INTO "Conversion" ("id", "inquiryId", "propertyId", "ownerId", "firstPaymentCurrency")
      VALUES (${randomUUID()}::uuid, ${ids.inquiry}::uuid, ${ids.property}::uuid, ${ids.owner}::uuid, 'KES')
    `).rejects.toThrow(/Conversion.*currency.*UGX/i);

    await prisma.conversion.create({
      data: {
        id: ids.conversion,
        inquiryId: ids.inquiry,
        propertyId: ids.property,
        ownerId: ids.owner,
        firstPaymentCurrency: "UGX",
      },
    });
    await prisma.commission.create({
      data: {
        id: ids.commission,
        conversionId: ids.conversion,
        ownerId: ids.owner,
        percentage: 10,
        firstPaymentAmount: 100,
        amountDue: 10,
        currency: "UGX",
      },
    });
    await expect(prisma.$executeRaw`
      UPDATE "Commission" SET "currency" = 'KES' WHERE "id" = ${ids.commission}::uuid
    `).rejects.toThrow(/Commission.*currency.*UGX/i);

    await expect(prisma.$executeRaw`
      UPDATE "Property" SET "countryId" = ${kenyaCountryId}::uuid WHERE "id" = ${ids.property}::uuid
    `).rejects.toThrow(/Property.*country change/i);

    await expect(prisma.$executeRaw`
      UPDATE "Country" SET "code" = 'KE', "currency" = 'KES' WHERE "id" = ${ugandaCountryId}::uuid
    `).rejects.toThrow(/Country.*currency change/i);
  });
});
