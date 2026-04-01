// scripts/update-collateral-names.js
// One-time script to update instrument names and entities in collateralAllocation table

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
  },
});

async function main() {
  // Update FCI records: "Adcap Ahorro Pesos - Clase B" → "FCI ADCAP Ahorro MM Clase B"
  const fciResult = await prisma.collateralAllocation.updateMany({
    where: { asset: "wARS", tipo: "FCI" },
    data: {
      nombre: "FCI ADCAP Ahorro MM Clase B",
      entidad: "Banco Comercio",
    },
  });
  console.log(`Updated ${fciResult.count} FCI records`);

  // Update Cuenta_Remunerada records
  const ctaResult = await prisma.collateralAllocation.updateMany({
    where: { asset: "wARS", tipo: "Cuenta_Remunerada" },
    data: {
      nombre: "Cuenta Remunerada",
      entidad: "Banco Comercio",
    },
  });
  console.log(`Updated ${ctaResult.count} Cuenta_Remunerada records`);

  // Update A_la_Vista records
  const vistaResult = await prisma.collateralAllocation.updateMany({
    where: { asset: "wARS", tipo: "A_la_Vista" },
    data: {
      nombre: "Saldo a la Vista",
      entidad: "Banco Comercio",
    },
  });
  console.log(`Updated ${vistaResult.count} A_la_Vista records`);

  // Verify
  const sample = await prisma.collateralAllocation.findFirst({
    where: { asset: "wARS", tipo: "FCI" },
    orderBy: { fecha: "desc" },
    select: { nombre: true, entidad: true, tipo: true, fecha: true },
  });
  console.log("Sample after update:", sample);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
