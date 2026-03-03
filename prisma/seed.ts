// prisma/seed.ts
// Crea el primer usuario ADMIN en Supabase.
// Ejecutar DESPUÉS de conectar la DB y aplicar migraciones:
//   npm run db:seed
// Variables obligatorias en .env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim();

  if (!email || !password || !name) {
    console.error(
      "Faltan variables de entorno. En .env.local agregá:\n" +
        "  SEED_ADMIN_EMAIL=admin@ripio.com\n" +
        "  SEED_ADMIN_PASSWORD=TuContraseñaSegura123!\n" +
        "  SEED_ADMIN_NAME=Admin Ripio\n" +
        "Luego ejecutá: npm run db:seed"
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  const existing = await prisma.user.findUnique({
    where: { email },
  });
  if (existing) {
    console.log("Usuario ya existe:", email);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: "ADMIN",
    },
  });
  console.log("Usuario ADMIN creado:", email);

  await seedInstrumentoConfigs(prisma);

  await prisma.$disconnect();
}

async function seedInstrumentoConfigs(prisma: PrismaClient): Promise<void> {
  const defaults: { tipo: "FCI" | "Cuenta_Remunerada" | "A_la_Vista"; label: string; generaRendimiento: boolean }[] = [
    { tipo: "FCI", label: "FCI (Fondos Comunes de Inversión)", generaRendimiento: true },
    { tipo: "Cuenta_Remunerada", label: "Cuenta Remunerada", generaRendimiento: true },
    { tipo: "A_la_Vista", label: "Saldo a la Vista", generaRendimiento: false },
  ];

  for (const d of defaults) {
    await prisma.instrumentoConfig.upsert({
      where: { tipo: d.tipo },
      update: {},
      create: { tipo: d.tipo, label: d.label, generaRendimiento: d.generaRendimiento },
    });
  }
  console.log("InstrumentoConfig seed completado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
