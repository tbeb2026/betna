import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seed } from './seed';

describe.skipIf(!process.env.DATABASE_URL)('geography seed', () => {
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
});
