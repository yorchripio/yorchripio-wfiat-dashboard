import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const VCP_ESTIMATED = 18.5216;  // 18.51 * (1 + 0.000625) — estimado hasta VCP oficial ~6pm
  const fecha = new Date("2026-04-01T00:00:00.000Z");

  const fci = await prisma.collateralAllocation.findFirst({
    where: { asset: "wARS", tipo: "FCI", fecha },
  });

  if (!fci) { console.log("No encontré FCI para 01/04"); return; }

  await prisma.collateralAllocation.update({
    where: { id: fci.id },
    data: { valorCuotaparte: VCP_ESTIMATED },
  });

  const total = Number(fci.cantidadCuotasPartes) * VCP_ESTIMATED;
  console.log("FCI actualizado:");
  console.log("  VCP: " + Number(fci.valorCuotaparte) + " -> " + VCP_ESTIMATED + " (estimado +0.0625%)");
  console.log("  CP: " + fci.cantidadCuotasPartes);
  console.log("  FCI total: $" + total.toLocaleString("es-AR"));
  console.log("  + A_la_Vista: $20.020.000");
  console.log("  GRAN TOTAL: $" + (total + 20020000).toLocaleString("es-AR"));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
