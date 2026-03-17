// scripts/seed-cuotaparte-events.js
// Seed de los 16 eventos de suscripción/rescate conciliados con extractos bancarios
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

// Eventos conciliados de extractos bancarios Oct 2025 - Mar 2026
const EVENTS = [
  { fecha: "2025-10-09", tipo: "SUSCRIPCION", monto: 105000000, desc: "Suscripción inicial FCI" },
  { fecha: "2025-10-28", tipo: "SUSCRIPCION", monto: 75000000, desc: "Minteo +75M" },
  { fecha: "2025-11-13", tipo: "SUSCRIPCION", monto: 75000000, desc: "Minteo +75M (06/11)" },
  { fecha: "2025-11-13", tipo: "SUSCRIPCION", monto: 26000000, desc: "Minteo +26M (12/11)" },
  { fecha: "2025-11-14", tipo: "SUSCRIPCION", monto: 10000000, desc: "Minteo +10M (13/11)" },
  { fecha: "2025-12-12", tipo: "RESCATE", monto: 302047856, desc: "Rescate rebalanceo dic" },
  { fecha: "2025-12-15", tipo: "SUSCRIPCION", monto: 392731316, desc: "Re-suscripción rebalanceo dic" },
  { fecha: "2025-12-18", tipo: "SUSCRIPCION", monto: 50000000, desc: "Minteo +50M (18/12)" },
  { fecha: "2025-12-30", tipo: "RESCATE", monto: 446828172, desc: "Rescate cierre año" },
  { fecha: "2026-01-05", tipo: "SUSCRIPCION", monto: 448352968, desc: "Re-suscripción enero" },
  { fecha: "2026-01-12", tipo: "SUSCRIPCION", monto: 100159283, desc: "Minteo +100M (09/01)" },
  { fecha: "2026-03-03", tipo: "SUSCRIPCION", monto: 137000000, desc: "Minteo +100M (01/03) + 37M (03/02)" },
  { fecha: "2026-03-05", tipo: "RESCATE", monto: 500000000, desc: "Rescate rebalanceo mar" },
  { fecha: "2026-03-10", tipo: "RESCATE", monto: 113440198, desc: "Rescate parcial rebalanceo" },
  { fecha: "2026-03-10", tipo: "SUSCRIPCION", monto: 114586059, desc: "Re-suscripción parcial" },
  { fecha: "2026-03-10", tipo: "SUSCRIPCION", monto: 590000000, desc: "Re-suscripción + minteo +90M (09/03)" },
];

async function getVCPForDate(fecha) {
  // Buscar VCP del CAFCI en CollateralAllocation para esa fecha o la más cercana anterior
  for (let i = 0; i < 7; i++) {
    const d = new Date(fecha);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const alloc = await p.collateralAllocation.findFirst({
      where: { tipo: "FCI", fecha: new Date(dateStr + "T00:00:00Z") },
      select: { valorCuotaparte: true, fecha: true },
    });
    if (alloc) return { vcp: Number(alloc.valorCuotaparte), usedDate: dateStr };
  }
  return null;
}

async function main() {
  // Clear existing events
  await p.cuotaparteEvent.deleteMany({});
  console.log("Cleared existing events");

  let created = 0;
  for (const ev of EVENTS) {
    const vcpData = await getVCPForDate(ev.fecha);
    if (!vcpData) {
      console.log(`WARN: No VCP found for ${ev.fecha}, skipping`);
      continue;
    }

    const cuotapartes = ev.monto / vcpData.vcp;
    const sign = ev.tipo === "RESCATE" ? -1 : 1;

    await p.cuotaparteEvent.create({
      data: {
        asset: "wARS",
        fecha: new Date(ev.fecha + "T00:00:00Z"),
        tipo: ev.tipo,
        montoARS: ev.monto,
        vcpFCI: vcpData.vcp,
        cuotapartes: sign * cuotapartes,
        descripcion: ev.desc,
      },
    });

    console.log(
      `${ev.fecha} | ${ev.tipo.padEnd(12)} | $${ev.monto.toLocaleString().padStart(15)} | VCP: ${vcpData.vcp.toFixed(4)} (${vcpData.usedDate}) | Cuotapartes: ${(sign * cuotapartes).toFixed(2)}`
    );
    created++;
  }

  // Verificar cuotapartes totales
  const events = await p.cuotaparteEvent.findMany({ orderBy: { fecha: "asc" } });
  let totalCuotapartes = 0;
  for (const e of events) {
    totalCuotapartes += Number(e.cuotapartes);
  }
  console.log(`\nTotal events: ${created}`);
  console.log(`Cuotapartes totales: ${totalCuotapartes.toFixed(2)}`);

  await p.$disconnect();
}

main().catch(console.error);
