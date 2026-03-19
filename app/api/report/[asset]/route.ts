// app/api/report/[asset]/route.ts
// GET /api/report/wARS?from=2026-01-01&to=2026-03-19
// Generates and streams a PDF report for the given asset

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { type AssetSymbol, TOKEN_CONFIGS } from "@/lib/blockchain/config";
import { getReportData } from "@/lib/report/data-fetcher";
import { generateReport } from "@/lib/report/pdf-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { asset: rawAsset } = await params;
    const asset = rawAsset as AssetSymbol;

    if (!TOKEN_CONFIGS[asset]) {
      return NextResponse.json(
        { error: `Asset no soportado: ${rawAsset}` },
        { status: 400 }
      );
    }

    // Parse date range (default: last 30 days)
    const url = request.nextUrl;
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);

    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");

    const from = fromStr ? new Date(fromStr + "T00:00:00Z") : defaultFrom;
    const to = toStr ? new Date(toStr + "T23:59:59Z") : today;

    // Cap to 365 days max
    const maxRange = 365 * 86400000;
    if (to.getTime() - from.getTime() > maxRange) {
      from.setTime(to.getTime() - maxRange);
    }

    // Fetch all data
    const data = await getReportData(asset, from, to);

    // Generate PDF
    const pdfBuffer = await generateReport(data);

    // Format filename
    const dateStr = to.toISOString().slice(0, 10);
    const filename = `${asset}-reporte-${dateStr}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[API /report] Error generating report:", error);
    return NextResponse.json(
      { error: "Error generando reporte" },
      { status: 500 }
    );
  }
}
