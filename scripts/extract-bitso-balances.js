// Extract daily COP balances from Bitso account statements
const XLSX = require("xlsx");

const files = [
  { path: "C:/Users/Jorge/Downloads/report_8572196_BALANCE_2026-01-01-2026-03-01.xlsx", period: "Jan-Mar 2026" },
  { path: "C:/Users/Jorge/Downloads/report_8572196_BALANCE_2026-03-02-2026-04-06.xlsx", period: "Mar-Apr 2026" },
];

function parseDate(dateStr) {
  // "2026-01-06T11:08:51-03:00" → "2026-01-06"
  return dateStr.slice(0, 10);
}

for (const file of files) {
  console.log(`\n=== ${file.period} ===`);
  let wb;
  try { wb = XLSX.readFile(file.path); } catch (e) { console.log("Error:", e.message); continue; }

  const ws = wb.Sheets["cop"];
  if (!ws) { console.log("No COP sheet"); continue; }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Find header row (has "Saldo")
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].includes("Saldo")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { console.log("No header found"); continue; }

  const headers = rows[headerIdx];
  const fechaCol = 0; // Fecha y hora
  const saldoCol = headers.indexOf("Saldo");

  console.log(`Header at row ${headerIdx}, saldoCol=${saldoCol}`);

  // Track last balance per date
  const balanceByDate = new Map();
  let firstBalance = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[fechaCol]) continue;

    const dateStr = parseDate(String(row[fechaCol]));
    const saldo = Number(row[saldoCol]);

    if (!firstBalance && saldo > 0) firstBalance = { date: dateStr, saldo };

    // Last entry per date = EOD balance
    balanceByDate.set(dateStr, saldo);
  }

  // Get first entry balance (opening balance = balance BEFORE first tx)
  // The "Saldo" column shows balance AFTER the transaction
  // So the opening balance for the period is the balance before the first tx
  if (firstBalance) {
    console.log(`First transaction: ${firstBalance.date} → saldo after: ${firstBalance.saldo.toLocaleString("es-CO")}`);
  }

  // Show daily balances
  const dates = Array.from(balanceByDate.keys()).sort();
  console.log(`\nDaily EOD COP balances (${dates.length} dates):`);

  // Show key dates, not all 8000+
  const keyDates = new Set();
  // First and last of each month
  for (const d of dates) {
    const month = d.slice(0, 7);
    const monthDates = dates.filter(dd => dd.startsWith(month));
    keyDates.add(monthDates[0]);
    keyDates.add(monthDates[monthDates.length - 1]);
  }
  // Add specific dates of interest
  ["2026-01-01", "2026-01-06", "2026-01-08", "2026-01-13", "2026-01-14",
   "2026-01-31", "2026-02-01", "2026-02-09", "2026-02-28",
   "2026-03-01", "2026-03-03", "2026-03-04", "2026-03-07", "2026-03-31",
   "2026-04-06"].forEach(d => keyDates.add(d));

  for (const d of dates) {
    if (keyDates.has(d)) {
      console.log(`  ${d}: $${balanceByDate.get(d).toLocaleString("es-CO")} COP`);
    }
  }

  // Calculate opening balance
  // Look at the first transaction — saldo after + withdrawal or - deposit
  const firstRow = rows[headerIdx + 1];
  if (firstRow) {
    const saldoAfter = Number(firstRow[saldoCol]);
    const withdrawal = Number(firstRow[headers.indexOf("Monto del retiro")] || 0);
    const deposit = Number(firstRow[headers.indexOf("Monto del depósito")] || 0);
    const sell = Number(firstRow[headers.indexOf("Venta")] || 0);
    const buy = Number(firstRow[headers.indexOf("Compra")] || 0);
    const fee = Number(firstRow[headers.indexOf("Comisión")] || 0);
    const openingBalance = saldoAfter + withdrawal + fee - deposit + sell - buy;
    console.log(`\nOpening balance (reconstructed): $${openingBalance.toLocaleString("es-CO")} COP`);
  }
}
