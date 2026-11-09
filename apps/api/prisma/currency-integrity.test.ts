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
    commissionProperty: randomUUID(),
    kenyaProperty: randomUUID(),
    offering: randomUUID(),
    inquiry: randomUUID(),
    commissionInquiry: randomUUID(),
    raceInquiry: randomUUID(),
    conversion: randomUUID(),
    commissionConversion: randomUUID(),
    raceConversion: randomUUID(),
    commission: randomUUID(),
    linkedCommission: randomUUID(),
  };
  let ugandaCountryId: string;
  let kenyaCountryId: string;
  let kampalaCityId: string;
  let neighborhoodId: string;
  let nairobiCityId: string;
  let nairobiNeighborhoodId: string;

  beforeAll(async () => {
    await seed(prisma);
    const uganda = await prisma.country.findUniqueOrThrow({ where: { code: "UG" } });
    const kenya = await prisma.country.findUniqueOrThrow({ where: { code: "KE" } });
    const city = await prisma.city.findUniqueOrThrow({ where: { countryId_slug: { countryId: uganda.id, slug: "kampala" } } });
    const nairobi = await prisma.city.findUniqueOrThrow({ where: { countryId_slug: { countryId: kenya.id, slug: "nairobi" } } });
    ugandaCountryId = uganda.id;
    kenyaCountryId = kenya.id;
    kampalaCityId = city.id;
    nairobiCityId = nairobi.id;
    const neighborhoodRecord = await prisma.neighborhood.findFirstOrThrow({ where: { cityId: kampalaCityId } });
    neighborhoodId = neighborhoodRecord.id;
    nairobiNeighborhoodId = (await prisma.neighborhood.findFirstOrThrow({ where: { cityId: nairobiCityId } })).id;

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
    await prisma.property.createMany({
      data: [
        {
          id: ids.commissionProperty,
          ownerId: ids.owner,
          countryId: ugandaCountryId,
          cityId: kampalaCityId,
          neighborhoodId,
          title: "Commission currency fixture",
          slug: `currency-integrity-commission-${ids.commissionProperty}`,
          description: "Database trigger commission fixture",
          category: "residential",
          publicLocationLabel: "Kampala",
          publicLatitude: -0.3476,
          publicLongitude: 32.5825,
        },
        {
          id: ids.kenyaProperty,
          ownerId: ids.owner,
          countryId: kenyaCountryId,
          cityId: nairobiCityId,
          neighborhoodId: nairobiNeighborhoodId,
          title: "Kenya currency fixture",
          slug: `currency-integrity-kenya-${ids.kenyaProperty}`,
          description: "Database trigger destination fixture",
          category: "residential",
          publicLocationLabel: "Nairobi",
          publicLatitude: -1.2864,
          publicLongitude: 36.8172,
        },
      ],
    });
    await prisma.inquiry.create({
      data: {
        id: ids.commissionInquiry,
        reference: `CUR-COM-${ids.commissionInquiry.slice(0, 8)}`,
        propertyId: ids.commissionProperty,
        guestName: "Commission Guest",
        guestEmail: "currency-commission-fixture@example.test",
        guestPhone: "+256700000002",
        message: "Database trigger commission fixture",
      },
    });
    await prisma.inquiry.create({
      data: {
        id: ids.raceInquiry,
        reference: `CUR-RACE-${ids.raceInquiry.slice(0, 8)}`,
        propertyId: ids.property,
        guestName: "Concurrency Guest",
        guestEmail: "currency-concurrency-fixture@example.test",
        guestPhone: "+256700000003",
        message: "Database trigger concurrency fixture",
      },
    });
    await prisma.conversion.create({
      data: {
        id: ids.raceConversion,
        inquiryId: ids.raceInquiry,
        propertyId: ids.property,
        ownerId: ids.owner,
        firstPaymentCurrency: null,
      },
    });
    await prisma.conversion.create({
      data: {
        id: ids.commissionConversion,
        inquiryId: ids.commissionInquiry,
        propertyId: ids.commissionProperty,
        ownerId: ids.owner,
        firstPaymentCurrency: null,
      },
    });
    await prisma.commission.create({
      data: {
        id: ids.linkedCommission,
        conversionId: ids.commissionConversion,
        ownerId: ids.owner,
        percentage: 10,
        firstPaymentAmount: 100,
        amountDue: 10,
        currency: "UGX",
      },
    });
  });

  afterAll(async () => {
    await prisma.commission.deleteMany({ where: { id: { in: [ids.commission, ids.linkedCommission] } } });
    await prisma.conversion.deleteMany({ where: { id: { in: [ids.conversion, ids.commissionConversion, ids.raceConversion] } } });
    await prisma.inquiry.deleteMany({ where: { id: { in: [ids.inquiry, ids.commissionInquiry, ids.raceInquiry] } } });
    await prisma.offering.deleteMany({ where: { id: ids.offering } });
    await prisma.property.deleteMany({ where: { id: { in: [ids.property, ids.commissionProperty, ids.kenyaProperty] } } });
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
      INSERT INTO "Commission" ("id", "conversionId", "ownerId", "percentage", "firstPaymentAmount", "amountDue", "currency")
      VALUES (${randomUUID()}::uuid, ${ids.conversion}::uuid, ${ids.owner}::uuid, 10, 100, 10, 'KES')
    `).rejects.toThrow(/Commission.*currency.*UGX/i);

    await expect(prisma.$executeRaw`
      UPDATE "Property" SET "countryId" = ${kenyaCountryId}::uuid WHERE "id" = ${ids.commissionProperty}::uuid
    `).rejects.toThrow(/Property.*Commission.*currency/i);

    await expect(prisma.$executeRaw`
      UPDATE "Conversion" SET "propertyId" = ${ids.kenyaProperty}::uuid
      WHERE "id" = ${ids.commissionConversion}::uuid
    `).rejects.toThrow(/Conversion.*linked Commission.*currency/i);

    await expect(prisma.$executeRaw`
      UPDATE "Conversion" SET "firstPaymentCurrency" = 'KES'
      WHERE "id" = ${ids.commissionConversion}::uuid
    `).rejects.toThrow(/Conversion.*currency.*UGX/i);

    await expect(prisma.$executeRaw`
      UPDATE "Property" SET "countryId" = ${kenyaCountryId}::uuid WHERE "id" = ${ids.property}::uuid
    `).rejects.toThrow(/Property.*country change/i);

    await expect(prisma.$executeRaw`
      UPDATE "Country" SET "code" = 'KE', "currency" = 'KES' WHERE "id" = ${ugandaCountryId}::uuid
    `).rejects.toThrow(/Country.*currency change/i);
  });

  it("rejects a commission insert that races a committed conversion move", async () => {
    // Transaction A locks/updates Conversion first. Transaction B's direct SQL
    // Commission insert takes the same Conversion KEY SHARE lock and waits;
    // after A commits, B validates against A's committed Kenya destination.
    const concurrentPrisma = new PrismaClient();
    let insertPromise: Promise<number>;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT "id" FROM "Conversion" WHERE "id" = ${ids.raceConversion}::uuid FOR UPDATE
        `;
        insertPromise = concurrentPrisma.$executeRaw`
          INSERT INTO "Commission" ("id", "conversionId", "ownerId", "percentage", "firstPaymentAmount", "amountDue", "currency")
          VALUES (${randomUUID()}::uuid, ${ids.raceConversion}::uuid, ${ids.owner}::uuid, 10, 100, 10, 'UGX')
        `.then((result) => result);
        await tx.$executeRaw`SELECT pg_sleep(0.05)`;
        await tx.$executeRaw`
          UPDATE "Conversion" SET "propertyId" = ${ids.kenyaProperty}::uuid
          WHERE "id" = ${ids.raceConversion}::uuid
        `;
      });

      await expect(insertPromise!).rejects.toThrow(/Commission.*UGX.*KES/i);
    } finally {
      await concurrentPrisma.$disconnect();
    }
  });
});
