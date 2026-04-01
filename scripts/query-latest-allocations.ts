import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const latest = await prisma.collateralAllocation.findMany({
    where: { asset: "wARS", activo: true },
    orderBy: { fecha: "desc" },
    take: 8,
  });
  console.log("Latest wARS allocations:");
  for (const a of latest) {
    const d = a.fecha.toISOString().slice(0, 10);
    const val = Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte);
    console.log(`  ${d} | ${a.tipo} | ${a.nombre} | CP=${a.cantidadCuotasPartes} | VCP=${a.valorCuotaparte} | Total=$${val.toLocaleString("es-AR")}`);
  }
  const vcp = await prisma.portfolioVCP.findMany({ orderBy: { fecha: "desc" }, take: 5 });
  console.log("\nLatest PortfolioVCP:");
  for (const v of vcp) {
    console.log(`  ${v.fecha.toISOString().slice(0, 10)} | VCP=${v.vcp} | CP=${v.cuotapartesTotales} | Patrimonio=${v.patrimonio}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
