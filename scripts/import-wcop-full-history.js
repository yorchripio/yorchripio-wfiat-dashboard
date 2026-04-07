// Import FULL wCOP account history from Finandina CSV (Jan 2025 - Mar 2026)
// Combines the two CSVs: full history + March movements
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function parseColNumber(str) {
  return Number(str.replace("$", "").replace(/\./g, "").replace(",", ".").trim());
}

function parseColDate(str) {
  const [d, m, y] = str.split("/");
  return new Date(`${y}-${m}-${d}T12:00:00Z`);
}

function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, "utf-8");
  const lines = raw.split("\n").filter(l => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (!match) continue;
    rows.push({
      fecha: match[1].trim(),
      detalle: match[2].trim(),
      valor: parseColNumber(match[3]),
      saldo: parseColNumber(match[4]),
    });
  }
  return rows;
}

(async () => {
  // Parse both CSVs
  const csv1 = parseCSV("C:/Users/Jorge/Downloads/finandina 01_01_25 a 11_03_25 (1).csv");
  const csv2 = parseCSV("C:/Users/Jorge/Downloads/Movimientos (1) (1).csv");

  console.log(`CSV1 (full history): ${csv1.length} movements`);
  console.log(`CSV2 (March): ${csv2.length} movements`);

  // Merge: CSV1 has Jan 2025 - Mar 7, CSV2 has Mar 3 - Mar 31
  // Reverse both to chronological order
  csv1.reverse();
  csv2.reverse();

  // Combine: take all of CSV1, then CSV2 entries after CSV1's last date
  const allRows = [...csv1];
  const csv1LastDate = csv1[csv1.length - 1]?.fecha;
  console.log(`CSV1 last date: ${csv1LastDate}`);

  for (const r of csv2) {
    // Parse dates to compare
    const [d1, m1, y1] = csv1LastDate.split("/");
    const [d2, m2, y2] = r.fecha.split("/");
    const dt1 = `${y1}${m1}${d1}`;
    const dt2 = `${y2}${m2}${d2}`;
    if (dt2 > dt1) {
      allRows.push(r);
    }
  }

  console.log(`Combined: ${allRows.length} movements\n`);

  // Get EOD balance for each date (last transaction of each day = last in chrono order)
  const byDate = new Map();
  for (const r of allRows) {
    byDate.set(r.fecha, r.saldo); // Last entry per date wins
  }

  // Sort dates chronologically
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => {
    const [da, ma, ya] = a.split("/");
    const [db, mb, yb] = b.split("/");
    return `${ya}${ma}${da}`.localeCompare(`${yb}${mb}${db}`);
  });

  console.log("Daily EOD balances:");
  for (const d of sortedDates) {
    console.log(`  ${d}: $${byDate.get(d).toLocaleString("es-CO")}`);
  }

  // Fill gaps: for months with only rendimientos (no other tx),
  // the balance stays the same between entries
  // We have actual data points from the CSV, that's enough

  // Delete ALL existing snapshots and recreate
  console.log(`\nDeleting existing snapshots...`);
  const deleted = await prisma.wcopAccountSnapshot.deleteMany({});
  console.log(`Deleted ${deleted.count} snapshots`);

  // Create snapshots for each date
  console.log(`\nCreating ${sortedDates.length} snapshots...`);
  for (const dateStr of sortedDates) {
    const saldo = byDate.get(dateStr);
    const dt = parseColDate(dateStr);

    await prisma.wcopAccountSnapshot.create({
      data: {
        fechaCorte: dt,
        periodoInicio: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)),
        periodoFin: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)),
        saldoFinal: saldo,
        capitalWcop: 0, // Will be filled from Excel data if needed
        rendimientos: 0,
        retirosMM: 0,
        depositosMM: 0,
        impuestos: 0,
      }
    });
  }

  // Now update capitalWcop from the Excel data for Jan-Mar 2026
  // Excel has WCOP_dia = min(97,572,654, saldo) for those dates
  // For pre-2026 dates, all funds are collateral so capitalWcop = saldo
  const CAPITAL_WCOP = 97572654;
  const allSnaps = await prisma.wcopAccountSnapshot.findMany({ orderBy: { fechaCorte: "asc" } });

  for (const snap of allSnaps) {
    const d = snap.fechaCorte.toISOString().slice(0, 10);
    const saldo = Number(snap.saldoFinal);

    // Before Jan 8 2026: no identified wCOP transfers yet, but all funds = collateral
    // After Jan 13 2026: capitalWcop = min(97,572,654, saldo)
    let capitalWcop;
    if (d < "2026-01-08") {
      capitalWcop = saldo; // All funds are collateral
    } else if (d < "2026-01-13") {
      capitalWcop = Math.min(11000, saldo); // Only first $11K transfer identified
    } else {
      capitalWcop = Math.min(CAPITAL_WCOP, saldo);
    }

    await prisma.wcopAccountSnapshot.update({
      where: { id: snap.id },
      data: { capitalWcop }
    });
  }

  // Verify
  const total = await prisma.wcopAccountSnapshot.count();
  const first = await prisma.wcopAccountSnapshot.findFirst({ orderBy: { fechaCorte: "asc" } });
  const last = await prisma.wcopAccountSnapshot.findFirst({ orderBy: { fechaCorte: "desc" } });
  console.log(`\nTotal: ${total} snapshots`);
  console.log(`First: ${first.fechaCorte.toISOString().slice(0, 10)} saldo=$${Number(first.saldoFinal).toLocaleString("es-CO")}`);
  console.log(`Last: ${last.fechaCorte.toISOString().slice(0, 10)} saldo=$${Number(last.saldoFinal).toLocaleString("es-CO")}`);

  await prisma.$disconnect();
})();
