import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seed } from './seed';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run apps/api/prisma/seed.test.ts');
}

describe('geography seed and durable database contracts', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await seed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds the launch countries with their local currencies', async () => {
    const countries = await prisma.country.findMany({
      where: { code: { in: ['KE', 'UG'] } },
      orderBy: { code: 'asc' },
    });

    expect(countries.map(({ code, currency }) => ({ code, currency }))).toEqual([
      { code: 'KE', currency: 'KES' },
      { code: 'UG', currency: 'UGX' },
    ]);
  });

  it('seeds Nairobi and Kampala as country-linked cities', async () => {
    const cities = await prisma.city.findMany({
      where: { slug: { in: ['nairobi', 'kampala'] } },
      include: { country: true },
      orderBy: { slug: 'asc' },
    });

    expect(cities.map(({ slug, country }) => ({ slug, country: country.code }))).toEqual([
      { slug: 'kampala', country: 'UG' },
      { slug: 'nairobi', country: 'KE' },
    ]);
  });

  it('uses UUID primary keys and keeps public and private locations separate', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string; udt_name: string }>>`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Property'
        AND column_name IN ('id', 'publicLatitude', 'publicLongitude', 'exactAddress', 'exactLocationGeometry')
      ORDER BY column_name
    `;

    expect(columns).toEqual([
      { column_name: 'exactAddress', udt_name: 'text' },
      { column_name: 'exactLocationGeometry', udt_name: 'geometry' },
      { column_name: 'id', udt_name: 'uuid' },
      { column_name: 'publicLatitude', udt_name: 'numeric' },
      { column_name: 'publicLongitude', udt_name: 'numeric' },
    ]);
  });

  it('enables PostGIS for exact private location geometry', async () => {
    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'postgis'
    `;

    expect(extensions).toEqual([{ extname: 'postgis' }]);
  });

  it('rejects audit updates, deletes, and truncation', async () => {
    const event = await prisma.auditEvent.create({
      data: {
        action: 'TEST_IMMUTABILITY',
        entityType: 'Property',
        entityId: '00000000-0000-0000-0000-000000000001',
      },
    });

    await expect(
      prisma.$executeRaw`UPDATE "AuditEvent" SET action = 'MUTATED' WHERE id = ${event.id}::uuid`,
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.$executeRaw`DELETE FROM "AuditEvent" WHERE id = ${event.id}::uuid`,
    ).rejects.toThrow(/immutable/i);
    await expect(prisma.$executeRaw`TRUNCATE TABLE "AuditEvent"`).rejects.toThrow(/immutable/i);
  });
});
