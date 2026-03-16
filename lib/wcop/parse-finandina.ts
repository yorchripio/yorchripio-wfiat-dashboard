// lib/wcop/parse-finandina.ts
// Parsea el CSV extracto bancario de Finandina (Colombia).
// Metodología: reconstruye saldo diario, calcula rendimiento WCOP proporcional día a día.

export interface FinandinaTransaction {
  fecha: string;        // YYYY-MM-DD
  descripcion: string;
  valor: number;        // positive = credit, negative = debit
  saldo: number;
  tipo: "rendimiento" | "deposito_wcop" | "retiro_mm" | "deposito_mm" | "impuesto" | "otro";
}

export interface MonthlyBreakdown {
  mes: string;           // "2026-01", "2026-02", etc.
  rendTotalCuenta: number;
  rendWcop: number;
  tasaDiaria: number;
  tnaImplicita: number;
  fraccionWcop: number;
}

export interface WcopParsedSummary {
  periodoInicio: string;    // YYYY-MM-DD (first WCOP deposit date)
  periodoFin: string;       // YYYY-MM-DD (last transaction date)
  saldoFinal: number;
  capitalWcop: number;      // sum of WCOP deposits (Coopcentral 9011830296)
  rendimientos: number;     // WCOP-proportional rendimientos (day-by-day method)
  rendimientosTotalCuenta: number; // total account interest (for reference)
  retirosMM: number;        // sum of MM withdrawals (positive magnitude)
  depositosMM: number;      // sum of MM deposits (Koywe)
  impuestos: number;        // sum of 4x1000 tax (positive magnitude)
  diasPeriodo: number;
  tna: number;
  tea: number;
  monthlyBreakdown: MonthlyBreakdown[];
  transactions: FinandinaTransaction[];
}

function parseCopDate(s: string): string {
  const m = s.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseCopAmount(s: string): number {
  let cleaned = s.replace(/\$\s*/g, "").trim();
  const isNeg = cleaned.startsWith("-") || cleaned.startsWith("(");
  cleaned = cleaned.replace(/^[-()]|[)]$/g, "").trim();
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(normalized) || 0;
  return isNeg ? -val : val;
}

function classifyTransaction(descripcion: string): FinandinaTransaction["tipo"] {
  const d = descripcion.toLowerCase().trim();

  if (d.includes("rendimientos financieros")) return "rendimiento";

  // WCOP deposits: Coopcentral 9011830296 (Nombre Empresa / collateral transfers)
  // Koywe (9016209541) and Spacewalk (9012288029) are MM operations
  if (d.includes("transf. recibida") && d.includes("coopcentral") && d.includes("9011830296")) {
    return "deposito_wcop";
  }

  // Koywe transfers are MM deposits
  if (d.includes("transf. recibida") && (d.includes("koywe") || d.includes("9016209541"))) {
    return "deposito_mm";
  }

  // Spacewalk transfers are also MM
  if (d.includes("transf. recibida") && (d.includes("spacewalk") || d.includes("9012288029"))) {
    return "deposito_mm";
  }

  // Other incoming transfers — classify as other (not WCOP by default)
  if (d.includes("transf. recibida")) return "deposito_mm";

  // Pexto debits = MM withdrawals
  if (d.includes("pse") && d.includes("pexto")) return "retiro_mm";

  // 4x1000 tax
  if (d.includes("gravamen") || d.includes("4 por mil")) return "impuesto";

  // Outgoing transfers
  if (d.includes("transf. enviada")) return "retiro_mm";

  return "otro";
}

/** Add N days to a YYYY-MM-DD date string */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Get YYYY-MM from YYYY-MM-DD */
function getMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Day diff between two YYYY-MM-DD dates */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export function parseFinandinaCsv(content: string): WcopParsedSummary {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  const headerIdx = lines.findIndex((l) =>
    l.toLowerCase().includes("fecha") && l.toLowerCase().includes("detalle")
  );
  const dataLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

  const transactions: FinandinaTransaction[] = [];

  for (const line of dataLines) {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    if (fields.length < 4) continue;

    const dateMatch = fields[0].match(/\d{2}\/\d{2}\/\d{4}/);
    if (!dateMatch) continue;

    const fecha = parseCopDate(dateMatch[0]);
    const descripcion = fields[1].replace(/\s+/g, " ").trim();
    const valor = parseCopAmount(fields[2]);
    const saldo = parseCopAmount(fields[3]);
    const tipo = classifyTransaction(descripcion);

    transactions.push({ fecha, descripcion, valor, saldo, tipo });
  }

  // Sort chronologically
  transactions.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.saldo - a.valor) - (b.saldo - b.valor));

  // ── Step 1: Identify WCOP capital (Coopcentral 9011830296 deposits only) ──
  let capitalWcop = 0;
  // Track when capital arrives for proportional calculation
  const capitalEvents: { fecha: string; amount: number; cumulative: number }[] = [];
  for (const t of transactions) {
    if (t.tipo === "deposito_wcop") {
      capitalWcop += t.valor;
      capitalEvents.push({ fecha: t.fecha, amount: t.valor, cumulative: capitalWcop });
    }
  }

  // ── Step 2: Reconstruct daily balances ──
  // Build a map of date → closing balance from the CSV's saldo column
  const balanceByDate = new Map<string, number>();
  for (const t of transactions) {
    // Last transaction of each day gives the closing balance
    balanceByDate.set(t.fecha, t.saldo);
  }

  // ── Step 3: Group interest payments by month ──
  const interestByMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.tipo === "rendimiento") {
      const mes = getMonth(t.fecha);
      interestByMonth.set(mes, (interestByMonth.get(mes) || 0) + t.valor);
    }
  }

  // Total account interest
  let rendimientosTotalCuenta = 0;
  for (const t of transactions) {
    if (t.tipo === "rendimiento") rendimientosTotalCuenta += t.valor;
  }

  // Other totals
  let retirosMM = 0;
  let depositosMM = 0;
  let impuestos = 0;
  for (const t of transactions) {
    switch (t.tipo) {
      case "retiro_mm": retirosMM += Math.abs(t.valor); break;
      case "deposito_mm": depositosMM += t.valor; break;
      case "impuesto": impuestos += Math.abs(t.valor); break;
    }
  }

  const periodoFin = transactions.length > 0 ? transactions[transactions.length - 1].fecha : "";
  const saldoFinal = transactions.length > 0 ? transactions[transactions.length - 1].saldo : 0;

  // Find first WCOP deposit date as periodo inicio
  const firstWcopDeposit = transactions.find((t) => t.tipo === "deposito_wcop");
  const periodoInicio = firstWcopDeposit ? firstWcopDeposit.fecha : (transactions[0]?.fecha ?? "");

  if (capitalWcop === 0 || !periodoInicio || !periodoFin) {
    return {
      periodoInicio, periodoFin, saldoFinal,
      capitalWcop, rendimientos: 0, rendimientosTotalCuenta,
      retirosMM, depositosMM, impuestos,
      diasPeriodo: 0, tna: 0, tea: 0,
      monthlyBreakdown: [], transactions,
    };
  }

  // ── Step 4: Build daily balance array ──
  // Start from the first day of the month containing periodoInicio (to capture full month)
  const firstMonthStart = periodoInicio.slice(0, 8) + "01";

  // Fill forward: for days without transactions, carry the previous day's balance
  const allDates = [...balanceByDate.keys()].sort();
  // Get last known balance before the start
  let prevBalance = 0;
  for (const d of allDates) {
    if (d < firstMonthStart) prevBalance = balanceByDate.get(d)!;
  }

  // Build daily array
  const dailyBalances: { fecha: string; saldoTotal: number; wcopDia: number; mes: string }[] = [];
  let currentBalance = balanceByDate.get(firstMonthStart) ?? prevBalance;

  const totalDays = daysBetween(firstMonthStart, periodoFin) + 1;
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(firstMonthStart, i);

    // Use actual balance if we have it, otherwise carry forward
    if (balanceByDate.has(date)) {
      currentBalance = balanceByDate.get(date)!;
    }

    // WCOP_dia = min(total_capital_wcop, saldo_total)
    // Uses FINAL total capital (not cumulative-at-date), matching user's methodology
    const wcopDia = Math.min(capitalWcop, currentBalance);

    dailyBalances.push({
      fecha: date,
      saldoTotal: currentBalance,
      wcopDia: Math.max(0, wcopDia),
      mes: getMonth(date),
    });
  }

  // ── Step 5: For each month, compute daily implicit rate & WCOP rendimiento ──
  // Group daily balances by month
  const dailyByMonth = new Map<string, typeof dailyBalances>();
  for (const d of dailyBalances) {
    if (!dailyByMonth.has(d.mes)) dailyByMonth.set(d.mes, []);
    dailyByMonth.get(d.mes)!.push(d);
  }

  let totalRendWcop = 0;
  const monthlyBreakdown: MonthlyBreakdown[] = [];

  // Sort months chronologically
  const months = [...dailyByMonth.keys()].sort();

  for (const mes of months) {
    const days = dailyByMonth.get(mes)!;
    const monthInterest = interestByMonth.get(mes) || 0;

    // Sum of daily total balances for this month
    const sumSaldoTotal = days.reduce((s, d) => s + d.saldoTotal, 0);
    const sumWcopDia = days.reduce((s, d) => s + d.wcopDia, 0);

    if (sumSaldoTotal === 0 || monthInterest === 0) {
      // For months without interest data (e.g., current month), use previous month's rate
      // or skip if no interest at all
      const prevMonth = monthlyBreakdown.length > 0
        ? monthlyBreakdown[monthlyBreakdown.length - 1]
        : null;

      if (prevMonth && prevMonth.tasaDiaria > 0 && sumWcopDia > 0) {
        // Use previous month's daily rate as proxy (same as user's March estimation)
        const rendWcop = prevMonth.tasaDiaria * sumWcopDia;
        totalRendWcop += rendWcop;
        const fraccion = sumSaldoTotal > 0 ? sumWcopDia / sumSaldoTotal : 0;

        monthlyBreakdown.push({
          mes,
          rendTotalCuenta: monthInterest,
          rendWcop,
          tasaDiaria: prevMonth.tasaDiaria,
          tnaImplicita: prevMonth.tasaDiaria * 365,
          fraccionWcop: fraccion,
        });
      }
      continue;
    }

    // Daily implicit rate = total monthly interest / sum of daily total balances
    const tasaDiaria = monthInterest / sumSaldoTotal;

    // WCOP rendimiento for this month = sum(tasaDiaria * wcopDia) = tasaDiaria * sumWcopDia
    const rendWcop = tasaDiaria * sumWcopDia;
    totalRendWcop += rendWcop;

    const fraccion = sumSaldoTotal > 0 ? sumWcopDia / sumSaldoTotal : 0;

    monthlyBreakdown.push({
      mes,
      rendTotalCuenta: monthInterest,
      rendWcop,
      tasaDiaria,
      tnaImplicita: tasaDiaria * 365,
      fraccionWcop: fraccion,
    });
  }

  // ── Step 6: Compute TNA/TEA ──
  // Period from first capital deposit to last date
  const diasPeriodo = daysBetween(periodoInicio, periodoFin);
  const retornoSimple = capitalWcop > 0 ? totalRendWcop / capitalWcop : 0;
  const tna = diasPeriodo > 0 ? retornoSimple * (365 / diasPeriodo) : 0;
  const tea = diasPeriodo > 0 ? Math.pow(1 + retornoSimple, 365 / diasPeriodo) - 1 : 0;

  return {
    periodoInicio,
    periodoFin,
    saldoFinal,
    capitalWcop,
    rendimientos: Math.round(totalRendWcop * 100) / 100,
    rendimientosTotalCuenta,
    retirosMM,
    depositosMM,
    impuestos,
    diasPeriodo,
    tna,
    tea,
    monthlyBreakdown,
    transactions,
  };
}
