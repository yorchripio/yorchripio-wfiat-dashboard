// scripts/rebuild-portfolio-vcp.js
// Recalcula el VCP diario del portfolio usando rendimiento CAFCI
// VCP solo cambia por rendimiento del fondo, NUNCA por flujos de capital
//
// Método:
//   1. Patrimonio crece cada día por el rendimiento diario del CAFCI VCP
//   2. Cuando hay evento: patrimonio +/- montoARS, cuotas += cuotapartes (signed)
//   3. portfolioVCP = patrimonio / cuotapartesTotales
//   → Capital in/out no afecta VCP porque ambos cambian proporcionalmente

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

  // 2. Load CAFCI VCP diario
  const fciAllocs = await p.collateralAllocation.findMany({
    where: { asset: "wARS", tipo: "FCI" },
    orderBy: { fecha: "asc" },
    select: { fecha: true, valorCuotaparte: true },
  });
  const cafciVcpByDate = {};
  for (const a of fciAllocs) {
    cafciVcpByDate[a.fecha.toISOString().slice(0, 10)] = Number(a.valorCuotaparte);
  }
  console.log(`Loaded ${fciAllocs.length} CAFCI VCP records`);

  // 3. Get all unique dates
  const allDates = Object.keys(cafciVcpByDate).sort();
  if (allDates.length === 0) {
    console.log("No CAFCI data found");
    return;
  }

  // 4. Clear existing VCP records
  await p.portfolioVCP.deleteMany({ where: { asset: "wARS" } });
  console.log("Cleared existing PortfolioVCP records");

  // 5. Build VCP history
  let patrimonio = 0;
  let cuotapartesTotales = 0;
  let prevCafciVcp = null;
  const records = [];

  for (const dateKey of allDates) {
    const cafciVcp = cafciVcpByDate[dateKey];

    // Step A: Apply daily FCI return to existing patrimonio
    if (prevCafciVcp && prevCafciVcp > 0 && patrimonio > 0) {
      const dailyReturnFactor = cafciVcp / prevCafciVcp;
      patrimonio *= dailyReturnFactor;
    }

    // Step B: Process events for this date
    // montoARS is always positive, cuotapartes is signed (negative for RESCATE)
    if (eventsByDate[dateKey]) {
      for (const ev of eventsByDate[dateKey]) {
        const monto = Number(ev.montoARS);
        const cuotas = Number(ev.cuotapartes); // positive for SUSC, negative for RESCATE

        if (ev.tipo === "SUSCRIPCION") {
          patrimonio += monto;
        } else if (ev.tipo === "RESCATE") {
          patrimonio -= monto;
        }
        cuotapartesTotales += cuotas; // signed, so RESCATE subtracts

        const vcpBefore = cuotapartesTotales !== 0 ? patrimonio / cuotapartesTotales : 0;
        console.log(`  ${dateKey} ${ev.tipo.padEnd(12)} ${ev.tipo === "SUSCRIPCION" ? "+" : "-"}$${monto.toLocaleString().padStart(15)} | cuotas: ${cuotas > 0 ? "+" : ""}${cuotas.toFixed(2)} → total: ${cuotapartesTotales.toFixed(2)} | VCP: ${vcpBefore.toFixed(4)}`);
      }
    }

    prevCafciVcp = cafciVcp;

    if (cuotapartesTotales <= 0) continue;

    const portfolioVcp = patrimonio / cuotapartesTotales;

    records.push({
      asset: "wARS",
      fecha: new Date(dateKey + "T00:00:00Z"),
      vcp: portfolioVcp,
      cuotapartesTotales,
      patrimonio,
    });
  }

  // 6. Batch insert using createMany
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await p.portfolioVCP.createMany({ data: batch });
    inserted += batch.length;
  }

  console.log(`\nInserted ${inserted} PortfolioVCP records`);

  // 7. Verify
  const first = records[0];
  const last = records[records.length - 1];
  const rendTotal = ((last.vcp / first.vcp) - 1) * 100;
  const dias = Math.round((last.fecha - first.fecha) / 86400000);
  const tna = dias > 0 ? (rendTotal / dias) * 365 : 0;

  console.log(`\nVerificación:`);
  console.log(`  Primer día: ${first.fecha.toISOString().slice(0, 10)} | VCP: ${first.vcp.toFixed(4)} | Patrimonio: $${Math.round(first.patrimonio).toLocaleString()}`);
  console.log(`  Último día: ${last.fecha.toISOString().slice(0, 10)} | VCP: ${last.vcp.toFixed(4)} | Patrimonio: $${Math.round(last.patrimonio).toLocaleString()}`);
  console.log(`  Cuotapartes: ${last.cuotapartesTotales.toFixed(2)}`);
  console.log(`  Rendimiento total: ${rendTotal.toFixed(4)}%`);
  console.log(`  Días: ${dias}`);
  console.log(`  TNA: ${tna.toFixed(2)}%`);

  // 8. Check VCP around event dates for distortion
  console.log(`\nVerificación de eventos (VCP no debe distorsionarse):`);
  for (const dk of Object.keys(eventsByDate).sort()) {
    const idx = records.findIndex(r => r.fecha.toISOString().slice(0, 10) === dk);
    if (idx > 0) {
      const pre = records[idx - 1];
      const post = records[idx];
      const daysBetween = Math.max(1, Math.round((post.fecha - pre.fecha) / 86400000));
      const change = ((post.vcp / pre.vcp) - 1) * 100;
      const dailyChange = change / daysBetween;
      // Normal daily MM return is ~0.05-0.08%, anything > 0.15% per day is suspicious
      const ok = Math.abs(dailyChange) < 0.15;
      console.log(`  ${dk}: VCP ${pre.vcp.toFixed(2)} → ${post.vcp.toFixed(2)} (${change >= 0 ? "+" : ""}${change.toFixed(4)}% en ${daysBetween}d, ${dailyChange.toFixed(4)}%/d) ${ok ? '✅' : '⚠️'}`);
    }
  }

  // 9. Show last 10 records
  console.log(`\nÚltimos 10 registros:`);
  const tail = records.slice(-10);
  let prevV = tail.length > 0 ? records[records.indexOf(tail[0]) - 1]?.vcp : null;
  for (const r of tail) {
    const change = prevV ? ((r.vcp / prevV - 1) * 100).toFixed(4) + "%" : "N/A";
    console.log(`  ${r.fecha.toISOString().slice(0, 10)} | VCP: ${r.vcp.toFixed(4)} | Δ: ${change} | cuotas: ${r.cuotapartesTotales.toFixed(2)} | pat: $${Math.round(r.patrimonio).toLocaleString()}`);
    prevV = r.vcp;
  }

  await p.$disconnect();
}

main().catch(console.error);
