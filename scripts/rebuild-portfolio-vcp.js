// scripts/rebuild-portfolio-vcp.js
// Recalcula el VCP diario del portfolio desde los eventos de cuotapartes
// VCP = patrimonio / cuotapartesTotales
// patrimonio = cuotapartesTotales_FCI × VCP_CAFCI + saldoVista
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // 1. Load all cuotaparte events
  const events = await p.cuotaparteEvent.findMany({
    where: { asset: "wARS" },
    orderBy: { fecha: "asc" },
  });
  console.log(`Loaded ${events.length} cuotaparte events`);

  // Build events map by date
  const eventsByDate = {};
  for (const e of events) {
    const dk = e.fecha.toISOString().slice(0, 10);
    if (!eventsByDate[dk]) eventsByDate[dk] = [];
    eventsByDate[dk].push(e);
  }

  // 2. Load all FCI allocations (VCP CAFCI diario)
  const fciAllocs = await p.collateralAllocation.findMany({
    where: { asset: "wARS", tipo: "FCI" },
    orderBy: { fecha: "asc" },
    select: { fecha: true, valorCuotaparte: true, cantidadCuotasPartes: true },
  });
  const vcpByDate = {};
  for (const a of fciAllocs) {
    vcpByDate[a.fecha.toISOString().slice(0, 10)] = Number(a.valorCuotaparte);
  }
  console.log(`Loaded ${fciAllocs.length} FCI VCP records`);

  // 3. Load saldo vista allocations
  const vistaAllocs = await p.collateralAllocation.findMany({
    where: { asset: "wARS", tipo: "A_la_Vista" },
    orderBy: { fecha: "asc" },
    select: { fecha: true, cantidadCuotasPartes: true, valorCuotaparte: true },
  });
  const vistaByDate = {};
  for (const a of vistaAllocs) {
    vistaByDate[a.fecha.toISOString().slice(0, 10)] = Number(a.cantidadCuotasPartes) * Number(a.valorCuotaparte);
  }

  // 4. Get all unique dates (from FCI allocations)
  const allDates = Object.keys(vcpByDate).sort();
  if (allDates.length === 0) {
    console.log("No FCI data found");
    return;
  }

  // 5. Clear existing VCP records
  await p.portfolioVCP.deleteMany({ where: { asset: "wARS" } });

  // 6. Calculate VCP for each day
  let cuotapartesTotales = 0;
  let lastVcp = null;
  const records = [];

  for (const dateKey of allDates) {
    // Apply events for this date (before calculating VCP)
    if (eventsByDate[dateKey]) {
      for (const ev of eventsByDate[dateKey]) {
        cuotapartesTotales += Number(ev.cuotapartes);
      }
    }

    if (cuotapartesTotales <= 0) continue;

    const vcpFCI = vcpByDate[dateKey];
    const saldoVista = vistaByDate[dateKey] ?? 0;

    // Patrimonio = cuotapartesTotales × VCP_FCI + saldoVista
    // Pero cuotapartesTotales son cuotapartes del FCI, no del portfolio
    // El portfolio VCP = patrimonio / cuotapartesTotales
    const patrimonio = cuotapartesTotales * vcpFCI + saldoVista;
    const portfolioVcp = patrimonio / cuotapartesTotales;

    records.push({
      asset: "wARS",
      fecha: new Date(dateKey + "T00:00:00Z"),
      vcp: portfolioVcp,
      cuotapartesTotales,
      patrimonio,
    });

    lastVcp = portfolioVcp;
  }

  // 7. Batch insert
  let inserted = 0;
  for (const r of records) {
    await p.portfolioVCP.create({ data: r });
    inserted++;
  }

  console.log(`\nInserted ${inserted} PortfolioVCP records`);

  // 8. Verify
  const first = records[0];
  const last = records[records.length - 1];
  const rendTotal = ((last.vcp / first.vcp) - 1) * 100;
  const dias = Math.round((last.fecha - first.fecha) / 86400000);
  const tna = (rendTotal / dias) * 365;

  console.log(`\nVerificación:`);
  console.log(`  Primer día: ${first.fecha.toISOString().slice(0, 10)} | VCP: ${first.vcp.toFixed(4)} | Patrimonio: $${Math.round(first.patrimonio).toLocaleString()}`);
  console.log(`  Último día: ${last.fecha.toISOString().slice(0, 10)} | VCP: ${last.vcp.toFixed(4)} | Patrimonio: $${Math.round(last.patrimonio).toLocaleString()}`);
  console.log(`  Cuotapartes: ${last.cuotapartesTotales.toFixed(2)}`);
  console.log(`  Rendimiento total: ${rendTotal.toFixed(4)}%`);
  console.log(`  Días: ${dias}`);
  console.log(`  TNA: ${tna.toFixed(2)}%`);

  // Verify mint doesn't affect VCP
  // Find VCP before and after first mint (28/10)
  const preIdx = records.findIndex(r => r.fecha.toISOString().slice(0, 10) === "2025-10-27");
  const postIdx = records.findIndex(r => r.fecha.toISOString().slice(0, 10) === "2025-10-28");
  if (preIdx >= 0 && postIdx >= 0) {
    const vcpPre = records[preIdx].vcp;
    const vcpPost = records[postIdx].vcp;
    const change = ((vcpPost / vcpPre) - 1) * 100;
    console.log(`\n  Verificación minteo 28/10:`);
    console.log(`    VCP 27/10: ${vcpPre.toFixed(4)}`);
    console.log(`    VCP 28/10: ${vcpPost.toFixed(4)} (cambio: ${change.toFixed(4)}%)`);
    console.log(`    ${Math.abs(change) < 0.5 ? '✅ VCP no se distorsionó con el minteo' : '⚠️ VCP cambió más de lo esperado'}`);
  }

  await p.$disconnect();
}

main().catch(console.error);
