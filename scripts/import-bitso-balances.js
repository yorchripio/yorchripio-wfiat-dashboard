// Import daily Bitso COP balances from Bitso account statements
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const files = [
  "C:/Users/Jorge/Downloads/report_8572196_BALANCE_2026-01-01-2026-03-01.xlsx",
  "C:/Users/Jorge/Downloads/report_8572196_BALANCE_2026-03-02-2026-04-06.xlsx",
];

(async () => {
  const dailyBalances = new Map(); // date → last COP balance

  for (const file of files) {
    let wb;
    try { wb = XLSX.readFile(file); } catch (e) { console.log(`Skip ${file}: ${e.message}`); continue; }
    const ws = wb.Sheets["cop"];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.includes("Saldo")) { headerIdx = i; break; }
    }
    if (headerIdx === -1) continue;

    const saldoCol = rows[headerIdx].indexOf("Saldo");

    // First transaction: reconstruct opening balance
    const firstRow = rows[headerIdx + 1];
    if (firstRow) {
      const headers = rows[headerIdx];
      const saldoAfter = Number(firstRow[saldoCol]) || 0;
      const withdrawal = Number(firstRow[headers.indexOf("Monto del retiro")] || 0);
      const deposit = Number(firstRow[headers.indexOf("Monto del depósito")] || 0);
      const sell = Number(firstRow[headers.indexOf("Venta")] || 0);
      const buy = Number(firstRow[headers.indexOf("Compra")] || 0);
      const fee = Number(firstRow[headers.indexOf("Comisión")] || 0);
      const opening = saldoAfter + withdrawal + fee - deposit + sell - buy;
      const firstDate = String(firstRow[0]).slice(0, 10);

      // Set opening balance for the day BEFORE first transaction
      const d = new Date(firstDate);
      d.setDate(d.getDate() - 1);
      const prevDate = d.toISOString().slice(0, 10);
      if (!dailyBalances.has(prevDate)) {
        dailyBalances.set(prevDate, opening);
      }
    }

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const dateStr = String(row[0]).slice(0, 10);
      const saldo = Number(row[saldoCol]);
      if (!isNaN(saldo)) {
        dailyBalances.set(dateStr, saldo); // Last entry per date wins = EOD
      }
    }
  }

  // Sort and fill gaps (carry forward between transaction dates)
  const dates = Array.from(dailyBalances.keys()).sort();
  console.log(`Raw dates with transactions: ${dates.length}`);

  // Fill gaps: for dates without transactions, carry forward last known balance
  const firstDate = new Date(dates[0]);
  const lastDate = new Date(dates[dates.length - 1]);
  const allDates = [];
  for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }

  let lastBalance = 0;
  const filledBalances = new Map();
  for (const d of allDates) {
    if (dailyBalances.has(d)) lastBalance = dailyBalances.get(d);
    filledBalances.set(d, lastBalance);
  }

  // Also add the opening balance for Jan 1 2026 if we don't have it
  // The account had ~$95.1M at the start - first tx was Jan 6
  if (!filledBalances.has("2026-01-01") && filledBalances.has("2026-01-05")) {
    const jan5 = filledBalances.get("2026-01-05");
    // Carry back from Jan 5 (no transactions before Jan 6)
    for (let d = 1; d <= 5; d++) {
      const ds = `2026-01-0${d}`;
      filledBalances.set(ds, jan5);
    }
  }

  // Show key dates
  console.log(`\nFilled daily balances (${filledBalances.size} dates):\n`);
  const keyDates = [
    "2025-12-31", "2026-01-01", "2026-01-05", "2026-01-06", "2026-01-08",
    "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-31",
    "2026-02-01", "2026-02-09", "2026-02-28",
    "2026-03-01", "2026-03-03", "2026-03-07", "2026-03-12", "2026-03-31",
    "2026-04-06",
  ];
  for (const d of keyDates) {
    const bal = filledBalances.get(d);
    if (bal !== undefined) {
      console.log(`  ${d}: $${bal.toLocaleString("es-CO")} COP`);
    }
  }

  // Import into DB
  console.log(`\nImporting ${filledBalances.size} daily Bitso balances...`);

  // Delete existing
  const deleted = await prisma.wcopBitsoBalance.deleteMany({});
  console.log(`Deleted ${deleted.count} existing records`);

  // Batch create
  const sortedEntries = Array.from(filledBalances.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let created = 0;
  for (const [dateStr, balance] of sortedEntries) {
    await prisma.wcopBitsoBalance.create({
      data: {
        fecha: new Date(dateStr + "T12:00:00Z"),
        saldoCop: balance,
      },
    });
    created++;
  }

  console.log(`Created ${created} Bitso balance records`);
  console.log(`Range: ${sortedEntries[0][0]} to ${sortedEntries[sortedEntries.length - 1][0]}`);

  await prisma.$disconnect();
})();
