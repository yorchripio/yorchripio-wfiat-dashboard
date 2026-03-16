// app/api/wbrl/import-balance/route.ts
// POST: Importa datos históricos de circulante y collateral desde el Excel "wBRL Collateral Balance"
// Parsea la hoja "Balance wBRL" y crea SupplySnapshot entries para wBRL.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

interface BalanceRow {
  fecha: string; // YYYY-MM-DD
  circulante: number;
  collateralValue: number;
  pctCollateralized: number;
  sobreCollateral: number;
  mints: number;
  burns: number;
  pnl: number;
}

function parseBalanceSheet(buffer: Buffer | Uint8Array): BalanceRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Balance wBRL"];
  if (!sheet) {
    throw new Error("Hoja 'Balance wBRL' no encontrada en el archivo");
  }

  // Parse as array of arrays (no headers)
  const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (data.length < 16) {
    throw new Error("El archivo no tiene suficientes filas");
  }

  // Row indices (0-based):
  // 1 = Fecha
  // 2 = Collateral Value al inicio
  // 3 = Mints
  // 4 = Burns
  // 7 = Collateral Value al cierre
  // 8 = PNL
  // 15 = wBRL Circulante
  // 16 = wBRL Collateralized
  // 17 = % Collateralized
  // 18 = Sobre / Under Collateralized

  const fechaRow = data[1];
  const mintsRow = data[3];
  const burnsRow = data[4];
  const pnlRow = data[8];
  const circulanteRow = data[15];
  const collateralRow = data[16];
  const pctRow = data[17];
  const sobreRow = data[18];

  const results: BalanceRow[] = [];

  // Columns start at index 1 (index 0 is the label)
  for (let j = 1; j < (fechaRow?.length ?? 0); j++) {
    const rawDate = fechaRow?.[j];
    if (rawDate == null) continue;

    // Parse date - could be Date object, string, or Excel serial number
    let fecha: string;
    if (typeof rawDate === "number") {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(rawDate);
      fecha = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } else if (typeof rawDate === "object" && rawDate !== null) {
      fecha = (rawDate as unknown as Date).toISOString().slice(0, 10);
    } else {
      const str = String(rawDate);
      // Try to parse YYYY-MM-DD or other formats
      const d = new Date(str);
      if (isNaN(d.getTime())) continue;
      fecha = d.toISOString().slice(0, 10);
    }

    const circulante = Number(circulanteRow?.[j] ?? 0);
    const collateralValue = Number(collateralRow?.[j] ?? 0);
    const pctCollateralized = Number(pctRow?.[j] ?? 0);
    const sobreCollateral = Number(sobreRow?.[j] ?? 0);
    const mints = Number(mintsRow?.[j] ?? 0);
    const burns = Number(burnsRow?.[j] ?? 0);
    const pnl = Number(pnlRow?.[j] ?? 0);

    if (circulante > 0 || collateralValue > 0) {
      results.push({
        fecha,
        circulante,
        collateralValue,
        pctCollateralized,
        sobreCollateral,
        mints,
        burns,
        pnl,
      });
    }
  }

  return results;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "TRADER" | "VIEWER";
    if (!hasMinRole(role, "TRADER")) {
      return NextResponse.json(
        { success: false, error: "Solo TRADER o ADMIN" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "Debe enviar el archivo XLSX" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const rows = parseBalanceSheet(buf);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron datos en la hoja 'Balance wBRL'" },
        { status: 400 }
      );
    }

    // Upsert supply snapshots for wBRL
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const snapshotAt = new Date(row.fecha + "T12:00:00Z");
      const idKey = `xlsx-wbrl-${row.fecha}`;

      const existing = await prisma.supplySnapshot.findFirst({
        where: {
          asset: "wBRL",
          id: idKey,
        },
      });

      const data = {
        asset: "wBRL",
        total: row.circulante,
        chainsJson: {
          source: "excel",
          circulante: row.circulante,
          collateralValue: row.collateralValue,
          pctCollateralized: row.pctCollateralized,
          sobreCollateral: row.sobreCollateral,
          mints: row.mints,
          burns: row.burns,
          pnl: row.pnl,
        },
        snapshotAt,
      };

      if (existing) {
        await prisma.supplySnapshot.update({
          where: { id: idKey },
          data,
        });
        updated++;
      } else {
        await prisma.supplySnapshot.create({
          data: { id: idKey, ...data },
        });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        created,
        updated,
        dateRange: {
          from: rows[rows.length - 1]?.fecha,
          to: rows[0]?.fecha,
        },
        latestCirculante: rows[0]?.circulante,
        latestCollateral: rows[0]?.collateralValue,
      },
    });
  } catch (error) {
    console.error("[wBRL import-balance]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error importando balance",
      },
      { status: 500 }
    );
  }
}
