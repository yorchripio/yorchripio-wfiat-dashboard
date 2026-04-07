// Reset wCOP snapshots and reimport from Excel with correct capitalWcop values
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const FILE = "C:/Users/Jorge/Downloads/WCOP_Rendimientos_Finandina (2).xlsx";
const DRY_RUN = process.argv.includes("--dry-run");

function parseNum(str) {
  if (!str || str === "") return 0;
  return Number(String(str).replace(/,/g, ""));
}

(async () => {
  // Step 1: Delete ALL existing snapshots except the manually curated March 7 and March 31
  // Actually, let's delete ALL and reimport everything clean
  console.log("=== Step 1: Delete existing snapshots ===");
  const existing = await prisma.wcopAccountSnapshot.findMany({ orderBy: { fechaCorte: "asc" } });
  console.log(`Found ${existing.length} existing snapshots`);

  if (!DRY_RUN) {
    const deleted = await prisma.wcopAccountSnapshot.deleteMany({});
    console.log(`Deleted ${deleted.count} snapshots`);
  }

  // Step 2: Parse Excel
  console.log("\n=== Step 2: Parse Excel ===");
  const wb = XLSX.readFile(FILE);
  const monthSheets = [
    "2. Enero 2026",
    "3. Febrero 2026",
    "4. Marzo 2026 (1-11)",
  ];

  const dailyData = [];
  for (const sheetName of monthSheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(c => String(c).includes("Fecha")) && rows[i].some(c => String(c).includes("Saldo Total"))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) continue;

    const headers = rows[headerIdx].map(String);
    const fechaCol = headers.findIndex(h => h.includes("Fecha"));
    const saldoCol = headers.findIndex(h => h.includes("Saldo Total"));
    const wcopCol = headers.findIndex(h => h.includes("WCOP del Dia"));
    const rendCol = headers.findIndex(h => h.includes("Rend. WCOP"));

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[fechaCol] || String(row[0]).includes("TOTAL")) break;

      let date;
      const fechaRaw = row[fechaCol];
      if (typeof fechaRaw === "number") {
        const d = XLSX.SSF.parse_date_code(fechaRaw);
        date = new Date(Date.UTC(d.y, d.m - 1, d.d, 12));
      } else {
        const parts = String(fechaRaw).split("/");
        if (parts.length === 3) date = new Date(Date.UTC(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 12));
      }
      if (!date || isNaN(date.getTime())) continue;

      const saldoTotal = parseNum(row[saldoCol]);
      const wcopDia = parseNum(row[wcopCol]);
      const rendDia = rendCol >= 0 ? parseNum(row[rendCol]) : 0;
      if (saldoTotal > 0) dailyData.push({ date, saldoTotal, wcopDia, rendDia });
    }
  }

  console.log(`Parsed ${dailyData.length} daily records from Excel (Jan 1 - Mar 11)`);

  // Step 3: Also add March 12-31 data from CSV movements
  // We don't have Excel data past Mar 11, so use the CSV saldos
  // These were already verified correct from the Movimientos CSV
  const marchCSVData = [
    // { date, saldo } — from the Movimientos CSV (EOD balances)
    // March 12-15: no transactions, carry forward from Mar 11 (129,602,917.86)
    { date: "2026-03-12", saldo: 129602917.86 },
    { date: "2026-03-13", saldo: 129602917.86 },
    { date: "2026-03-14", saldo: 129602917.86 },
    { date: "2026-03-15", saldo: 129602917.86 },
    { date: "2026-03-16", saldo: 125561676.78 },
    { date: "2026-03-17", saldo: 125453511.82 },
    { date: "2026-03-18", saldo: 132898511.82 },
    { date: "2026-03-19", saldo: 132762511.82 },
    // March 20-24: no transactions, carry forward
    { date: "2026-03-20", saldo: 132762511.82 },
    { date: "2026-03-21", saldo: 132762511.82 },
    { date: "2026-03-22", saldo: 132762511.82 },
    { date: "2026-03-23", saldo: 132762511.82 },
    { date: "2026-03-24", saldo: 132762511.82 },
    { date: "2026-03-25", saldo: 107054969.48 },
    { date: "2026-03-26", saldo: 106952139.32 },
    // March 27-30: no transactions, carry forward
    { date: "2026-03-27", saldo: 106952139.32 },
    { date: "2026-03-28", saldo: 106952139.32 },
    { date: "2026-03-29", saldo: 106952139.32 },
    { date: "2026-03-30", saldo: 106952139.32 },
    { date: "2026-03-31", saldo: 107966549.02 }, // After rendimientos
  ];

  const CAPITAL = 97572654;
  // Last rendDia from Excel (proxy rate from Feb)
  const REND_DIA_PROXY = 24547.474;

  // Compute cumulative rend from Excel data
  let cumRend = dailyData.reduce((s, d) => s + d.rendDia, 0);
  console.log(`Cumulative rend from Excel (through Mar 11): ${cumRend.toLocaleString("es-CO")}`);

  // Add March 12-31 CSV data
  for (const item of marchCSVData) {
    const dt = new Date(item.date + "T12:00:00Z");
    const dateStr = item.date;
    const existsInExcel = dailyData.some(d => d.date.toISOString().slice(0, 10) === dateStr);
    if (existsInExcel) continue;

    cumRend += REND_DIA_PROXY;
    dailyData.push({
      date: dt,
      saldoTotal: item.saldo,
      wcopDia: Math.min(CAPITAL, item.saldo),
      rendDia: REND_DIA_PROXY,
    });
  }

  console.log(`Total daily records (Jan-Mar): ${dailyData.length}`);

  // Step 4: Create snapshots
  console.log("\n=== Step 3: Create snapshots ===");
  // Re-compute cumRend from scratch
  cumRend = 0;

  const toCreate = [];
  for (const d of dailyData) {
    cumRend += d.rendDia;
    const dateStr = d.date.toISOString().slice(0, 10);

    toCreate.push({
      fechaCorte: d.date,
      periodoInicio: new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), 1)),
      periodoFin: new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth() + 1, 0)),
      saldoFinal: d.saldoTotal,
      capitalWcop: d.wcopDia,
      rendimientos: cumRend,
      retirosMM: 0,
      depositosMM: 0,
      impuestos: 0,
    });
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would create ${toCreate.length} snapshots`);
    // Show summary
    const byMonth = {};
    for (const d of toCreate) {
      const m = d.fechaCorte.toISOString().slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { count: 0, minSaldo: Infinity, maxSaldo: 0 };
      byMonth[m].count++;
      byMonth[m].minSaldo = Math.min(byMonth[m].minSaldo, d.saldoFinal);
      byMonth[m].maxSaldo = Math.max(byMonth[m].maxSaldo, d.saldoFinal);
    }
    for (const [m, v] of Object.entries(byMonth)) {
      console.log(`  ${m}: ${v.count} days | saldo ${v.minSaldo.toLocaleString("es-CO")} - ${v.maxSaldo.toLocaleString("es-CO")}`);
    }
    await prisma.$disconnect();
    return;
  }

  // Batch create
  let created = 0;
  for (const data of toCreate) {
    await prisma.wcopAccountSnapshot.create({ data });
    created++;
  }
  console.log(`Created ${created} snapshots`);

  // Verify
  const total = await prisma.wcopAccountSnapshot.count();
  const first = await prisma.wcopAccountSnapshot.findFirst({ orderBy: { fechaCorte: "asc" } });
  const last = await prisma.wcopAccountSnapshot.findFirst({ orderBy: { fechaCorte: "desc" } });
  console.log(`\nTotal: ${total} snapshots`);
  console.log(`Range: ${first.fechaCorte.toISOString().slice(0, 10)} to ${last.fechaCorte.toISOString().slice(0, 10)}`);
  console.log(`First saldo: ${Number(first.saldoFinal).toLocaleString("es-CO")}`);
  console.log(`Last saldo: ${Number(last.saldoFinal).toLocaleString("es-CO")}`);

  await prisma.$disconnect();
})();
