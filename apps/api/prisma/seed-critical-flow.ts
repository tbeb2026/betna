import { PrismaClient } from "@prisma/client";
import { AuthService } from "../src/auth/auth.service";
import { seed } from "./seed";

const prisma = new PrismaClient();
const ownerEmail = "critical-owner@betna.example";
const adminEmail = "critical-admin@betna.example";
const password = "critical-flow-password";

async function ensureRole(userId: string, roleName: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

async function main() {
  await seed(prisma);
  const country = await prisma.country.findUniqueOrThrow({ where: { code: "KE" } });
  const city = await prisma.city.findUniqueOrThrow({ where: { countryId_slug: { countryId: country.id, slug: "nairobi" } } });
  const neighborhood = await prisma.neighborhood.findUniqueOrThrow({ where: { cityId_slug: { cityId: city.id, slug: "kilimani" } } });
  const territory = await prisma.territory.findUniqueOrThrow({ where: { countryId_slug: { countryId: country.id, slug: "nairobi" } } });
  const passwordHash = await AuthService.hashPassword(password);
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { passwordHash, status: "ACTIVE", firstName: "Critical", lastName: "Owner", countryId: country.id },
    create: { email: ownerEmail, passwordHash, firstName: "Critical", lastName: "Owner", countryId: country.id },
  });
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, status: "ACTIVE", firstName: "Critical", lastName: "Admin", countryId: country.id },
    create: { email: adminEmail, passwordHash, firstName: "Critical", lastName: "Admin", countryId: country.id },
  });
  await ensureRole(owner.id, "OWNER");
  await ensureRole(admin.id, "ADMIN");
  await prisma.userTerritory.upsert({
    where: { userId_territoryId: { userId: admin.id, territoryId: territory.id } },
    update: {},
    create: { userId: admin.id, territoryId: territory.id },
  });
  const property = await prisma.property.upsert({
    where: { slug: "verified-kilimani-home" },
    update: {
      ownerId: owner.id, countryId: country.id, cityId: city.id, neighborhoodId: neighborhood.id,
      status: "PUBLISHED", verificationValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    create: {
      ownerId: owner.id, countryId: country.id, cityId: city.id, neighborhoodId: neighborhood.id,
      title: "Verified Kilimani home", slug: "verified-kilimani-home", description: "A bright, verified home.",
      category: "residential", subcategory: "apartment", publicLocationLabel: "Kilimani, Nairobi",
      publicLatitude: -1.2921, publicLongitude: 36.8219, exactAddress: "12 Private Lane",
      exactLatitude: -1.2922, exactLongitude: 36.822, authorizationAttested: true,
      status: "PUBLISHED", verificationValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.offering.upsert({
    where: { propertyId_mode: { propertyId: property.id, mode: "LONG_TERM" } },
    update: { currency: "KES", basePrice: 1000, negotiable: false },
    create: { propertyId: property.id, mode: "LONG_TERM", currency: "KES", basePrice: 1000, negotiable: false },
  });
  console.log(JSON.stringify({ ownerEmail, adminEmail, password, propertySlug: property.slug }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
