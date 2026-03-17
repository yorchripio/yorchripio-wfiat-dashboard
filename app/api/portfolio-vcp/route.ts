// app/api/portfolio-vcp/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const asset = searchParams.get("asset") ?? "wARS";
  const limit = Math.min(Number(searchParams.get("limit") ?? "365"), 500);

  const rows = await prisma.portfolioVCP.findMany({
    where: { asset },
    orderBy: { fecha: "asc" },
    take: limit,
    select: { fecha: true, vcp: true, cuotapartesTotales: true, patrimonio: true },
  });

  const data = rows.map((r) => ({
    fecha: r.fecha.toISOString().slice(0, 10),
    dateKey: r.fecha.toISOString().slice(0, 10),
    timestamp: r.fecha.getTime(),
    vcp: Number(r.vcp),
    cuotapartesTotales: Number(r.cuotapartesTotales),
    patrimonio: Number(r.patrimonio),
  }));

  return NextResponse.json({ data });
}
