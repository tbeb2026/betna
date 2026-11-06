import { PrismaClient } from '@prisma/client';

type SeedClient = Pick<PrismaClient, 'country' | 'role' | 'territory' | 'city' | 'neighborhood'>;

const countries = [
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'UG', name: 'Uganda', currency: 'UGX' },
] as const;

const roles = ['OWNER', 'VERIFIER', 'ADMIN'] as const;

const geography = [
  {
    countryCode: 'KE',
    cityName: 'Nairobi',
    citySlug: 'nairobi',
    neighborhoods: ['Westlands', 'Kilimani', 'Karen'],
  },
  {
    countryCode: 'UG',
    cityName: 'Kampala',
    citySlug: 'kampala',
    neighborhoods: ['Central Kampala', 'Kololo', 'Ntinda'],
  },
] as const;

/** Idempotently creates launch geography and the roles used by the API. */
export async function seed(prisma: SeedClient): Promise<void> {
  const countryIds = new Map<string, string>();

  for (const country of countries) {
    const record = await prisma.country.upsert({
      where: { code: country.code },
      update: { name: country.name, currency: country.currency },
      create: country,
    });
    countryIds.set(country.code, record.id);
  }

  for (const role of roles) {
    await prisma.role.upsert({ where: { name: role }, update: {}, create: { name: role } });
  }

  for (const entry of geography) {
    const countryId = countryIds.get(entry.countryCode);
    if (!countryId) {
      throw new Error(`Country ${entry.countryCode} was not seeded`);
    }

    const territory = await prisma.territory.upsert({
      where: { countryId_slug: { countryId, slug: entry.citySlug } },
      update: { name: entry.cityName },
      create: { countryId, name: entry.cityName, slug: entry.citySlug },
    });

    const city = await prisma.city.upsert({
      where: { countryId_slug: { countryId, slug: entry.citySlug } },
      update: { name: entry.cityName, territoryId: territory.id },
      create: {
        countryId,
        territoryId: territory.id,
        name: entry.cityName,
        slug: entry.citySlug,
      },
    });

    for (const neighborhood of entry.neighborhoods) {
      const slug = neighborhood.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await prisma.neighborhood.upsert({
        where: { cityId_slug: { cityId: city.id, slug } },
        update: { name: neighborhood },
        create: { cityId: city.id, name: neighborhood, slug },
      });
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('/prisma/seed.ts')) {
  void main();
}
