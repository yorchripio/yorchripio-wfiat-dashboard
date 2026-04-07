// Import daily wCOP account balances from Finandina CSV movements
// CSV format: "Fecha","Detalle","Valor","Saldo Crédito"
// Rows are newest-first, so first row of each date = EOD balance

const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const CSV_PATH = process.argv.filter(a => !a.startsWith("--"))[2] || "C:\\Users\\Jorge\\Downloads\\Movimientos (1) (1).csv";

function parseColNumber(str) {
  // "$ 107.966.549,02" → 107966549.02
  // "$ -12.000.000,00" → -12000000.00
  return Number(
    str.replace("$", "").replace(/\./g, "").replace(",", ".").trim()
  );
}

function parseColDate(str) {
  // "31/03/2026" → Date
  const [d, m, y] = str.split("/");
  return new Date(`${y}-${m}-${d}T12:00:00Z`);
}

(async () => {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());

  // Skip header
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Parse CSV — fields are quoted
    const match = lines[i].match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;
    rows.push({
      fecha: match[1].trim(),
      detalle: match[2].trim(),
      valor: parseColNumber(match[3]),
      saldo: parseColNumber(match[4]),
    });
  }

  console.log(`Parsed ${rows.length} movements from CSV`);

  // Reverse to chronological order (oldest first)
  rows.reverse();

  // Group by date — get EOD balance (last transaction of each day)
  const byDate = new Map();
  const movements = new Map(); // date → categorized movements

  for (const r of rows) {
    const dateKey = r.fecha; // DD/MM/YYYY
    byDate.set(dateKey, r.saldo); // Last one wins = EOD balance

    if (!movements.has(dateKey)) {
      movements.set(dateKey, {
        rendimientos: 0,
        retiros: 0,
        depositos: 0,
        impuestos: 0,
      });
    }
    const m = movements.get(dateKey);

    if (r.detalle.includes("Rendimientos")) {
      m.rendimientos += r.valor;
    } else if (r.detalle.includes("Gravamen")) {
      m.impuestos += Math.abs(r.valor);
    } else if (r.detalle.includes("Débito Comercio Pse")) {
      m.retiros += Math.abs(r.valor);
    } else if (r.detalle.includes("Transf. Recibida")) {
      m.depositos += r.valor;
    }
  }

  console.log(`\nDaily EOD balances:`);
  const dates = Array.from(byDate.keys()).sort((a, b) => {
    const [da, ma, ya] = a.split("/");
    const [db, mb, yb] = b.split("/");
    return `${ya}${ma}${da}`.localeCompare(`${yb}${mb}${db}`);
  });

  // Track cumulative totals
  let cumRend = 0, cumRetiros = 0, cumDepositos = 0, cumImpuestos = 0;

  // Get existing snapshots to preserve their cumulative values
  const existing = await prisma.wcopAccountSnapshot.findMany({
    orderBy: { fechaCorte: "asc" },
  });
  console.log(`\nExisting snapshots in DB: ${existing.length}`);
  for (const s of existing) {
    console.log(`  ${s.fechaCorte.toISOString().slice(0, 10)}: saldoFinal=${Number(s.saldoFinal).toLocaleString("es-CO")}`);
  }

  // Use the March 7 snapshot's cumulative values as baseline (if exists)
  const mar7 = existing.find(s => s.fechaCorte.toISOString().slice(0, 10) === "2026-03-07");
  if (mar7) {
    cumRend = Number(mar7.rendimientos);
    cumRetiros = Number(mar7.retirosMM);
    cumDepositos = Number(mar7.depositosMM);
    cumImpuestos = Number(mar7.impuestos);
    console.log(`\nUsing March 7 snapshot as baseline for cumulative values`);
  }

  const upserts = [];
  for (const dateStr of dates) {
    const eodBalance = byDate.get(dateStr);
    const m = movements.get(dateStr);
    const dt = parseColDate(dateStr);
    const isoDate = dt.toISOString().slice(0, 10);

    // Skip if same date as existing Mar 7 or Mar 31 snapshots (they have better data)
    const existingForDate = existing.find(s => s.fechaCorte.toISOString().slice(0, 10) === isoDate);

    // Accumulate from movements after March 7
    if (!mar7 || isoDate > "2026-03-07") {
      cumRend += m.rendimientos;
      cumRetiros += m.retiros;
      cumDepositos += m.depositos;
      cumImpuestos += m.impuestos;
    }

    console.log(`  ${dateStr} (${isoDate}): saldo=${eodBalance.toLocaleString("es-CO")} | mov: rend=${m.rendimientos.toLocaleString("es-CO")}, retiros=${m.retiros.toLocaleString("es-CO")}, dep=${m.depositos.toLocaleString("es-CO")}, imp=${m.impuestos.toLocaleString("es-CO")}${existingForDate ? " [EXISTS - will SKIP]" : ""}`);

    if (existingForDate) continue; // Don't overwrite manually uploaded snapshots

    upserts.push({
      fechaCorte: dt,
      periodoInicio: new Date("2026-03-01T00:00:00Z"),
      periodoFin: new Date("2026-03-31T00:00:00Z"),
      saldoFinal: eodBalance,
      capitalWcop: eodBalance - cumRend, // approximate
      rendimientos: cumRend,
      retirosMM: cumRetiros,
      depositosMM: cumDepositos,
      impuestos: cumImpuestos,
    });
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would create ${upserts.length} new snapshots`);
    return;
  }

  console.log(`\nCreating ${upserts.length} new snapshots...`);
  for (const data of upserts) {
    await prisma.wcopAccountSnapshot.create({ data });
    console.log(`  Created: ${data.fechaCorte.toISOString().slice(0, 10)} saldoFinal=${data.saldoFinal.toLocaleString("es-CO")}`);
  }

  // Verify
  const total = await prisma.wcopAccountSnapshot.count();
  console.log(`\nTotal snapshots now: ${total}`);

  await prisma.$disconnect();
})();
