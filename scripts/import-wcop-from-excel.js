// Import daily wCOP account data from the Rendimientos Excel
// Reads the day-by-day sheets for Jan, Feb, Mar and creates snapshots

const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const FILE = process.argv.filter(a => !a.startsWith("--"))[2] ||
  "C:/Users/Jorge/Downloads/WCOP_Rendimientos_Finandina (1).xlsx";
const DRY_RUN = process.argv.includes("--dry-run");

function parseNum(str) {
  if (!str || str === "") return 0;
  // "99,886,179.62" → 99886179.62 (US format in Excel CSV export)
  return Number(String(str).replace(/,/g, ""));
}

(async () => {
  const wb = XLSX.readFile(FILE);

  // Capital wCOP from summary sheet
  const CAPITAL_WCOP = 97572654;
  console.log(`Capital wCOP: ${CAPITAL_WCOP.toLocaleString("es-CO")}\n`);

  // Parse each monthly sheet
  const monthSheets = [
    { name: "2. Enero 2026", year: 2026, month: 1 },
    { name: "3. Febrero 2026", year: 2026, month: 2 },
    { name: "4. Marzo 2026 (1-11)", year: 2026, month: 3 },
  ];

  const dailyData = []; // { date, saldoTotal, wcopDia, rendDia }

  for (const ms of monthSheets) {
    const ws = wb.Sheets[ms.name];
    if (!ws) { console.log(`Sheet "${ms.name}" not found, skipping`); continue; }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    console.log(`=== ${ms.name} (${rows.length} rows) ===`);

    // Find header row (has "Fecha" and "Saldo Total")
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.some(c => String(c).includes("Fecha")) && row.some(c => String(c).includes("Saldo Total"))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) { console.log("  No header row found"); continue; }

    const headers = rows[headerIdx].map(String);
    const fechaCol = headers.findIndex(h => h.includes("Fecha"));
    const saldoCol = headers.findIndex(h => h.includes("Saldo Total"));
    const wcopCol = headers.findIndex(h => h.includes("WCOP del Dia"));
    const rendCol = headers.findIndex(h => h.includes("Rend. WCOP del Dia") || h.includes("Rend. WCOP"));

    console.log(`  Header at row ${headerIdx}: fecha=${fechaCol}, saldo=${saldoCol}, wcop=${wcopCol}, rend=${rendCol}`);

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[fechaCol]) break; // End of data
      const fechaRaw = row[fechaCol];

      // Parse date — could be DD/MM/YYYY string or Excel serial
      let date;
      if (typeof fechaRaw === "number") {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(fechaRaw);
        date = new Date(Date.UTC(d.y, d.m - 1, d.d, 12));
      } else {
        const parts = String(fechaRaw).split("/");
        if (parts.length === 3) {
          date = new Date(Date.UTC(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 12));
        }
      }
      if (!date || isNaN(date.getTime())) {
        // Skip TOTALES row etc
        if (String(row[0]).includes("TOTAL")) break;
        continue;
      }

      const saldoTotal = parseNum(row[saldoCol]);
      const wcopDia = parseNum(row[wcopCol]);
      const rendDia = rendCol >= 0 ? parseNum(row[rendCol]) : 0;

      if (saldoTotal > 0) {
        dailyData.push({ date, saldoTotal, wcopDia, rendDia });
      }
    }
  }

  console.log(`\nParsed ${dailyData.length} daily records\n`);

  // Get existing snapshots
  const existing = await prisma.wcopAccountSnapshot.findMany({
    orderBy: { fechaCorte: "asc" },
  });
  const existingDates = new Set(existing.map(s => s.fechaCorte.toISOString().slice(0, 10)));
  console.log(`Existing snapshots: ${existing.length} (${Array.from(existingDates).join(", ")})\n`);

  // Compute cumulative rendimientos
  let cumRend = 0;
  let cumDepositos = 0;
  let cumRetiros = 0;
  const toCreate = [];

  for (const d of dailyData) {
    const dateStr = d.date.toISOString().slice(0, 10);
    cumRend += d.rendDia;

    if (existingDates.has(dateStr)) {
      console.log(`  ${dateStr}: SKIP (exists) | saldo=${d.saldoTotal.toLocaleString("es-CO")} | wcop=${d.wcopDia.toLocaleString("es-CO")}`);
      continue;
    }

    console.log(`  ${dateStr}: saldo=${d.saldoTotal.toLocaleString("es-CO")} | wcop=${d.wcopDia.toLocaleString("es-CO")} | rendDia=${d.rendDia.toLocaleString("es-CO")} | cumRend=${cumRend.toLocaleString("es-CO")}`);

    toCreate.push({
      fechaCorte: d.date,
      periodoInicio: new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), 1)),
      periodoFin: new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth() + 1, 0)),
      saldoFinal: d.saldoTotal,
      capitalWcop: d.wcopDia,
      rendimientos: cumRend,
      retirosMM: 0, // Will be refined later if needed
      depositosMM: 0,
      impuestos: 0,
    });
  }

  console.log(`\n${toCreate.length} new snapshots to create`);

  if (DRY_RUN) {
    console.log("[DRY RUN] No changes made");
    await prisma.$disconnect();
    return;
  }

  for (const data of toCreate) {
    await prisma.wcopAccountSnapshot.create({ data });
    console.log(`  Created: ${data.fechaCorte.toISOString().slice(0, 10)}`);
  }

  // Verify
  const total = await prisma.wcopAccountSnapshot.count();
  console.log(`\nTotal snapshots now: ${total}`);

  await prisma.$disconnect();
})();
