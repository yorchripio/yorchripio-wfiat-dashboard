// app/api/supply/snapshots/route.ts
// GET: lista supply snapshots (con filtro from/to). POST: crea snapshot manual (solo ADMIN).

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { z } from "zod";

const DEFAULT_ASSET = "wARS";

const postSchema = z.object({
  snapshotAt: z.string().min(1),
  total: z.number().positive().finite(),
  ethereumSupply: z.number().nonnegative().finite().optional(),
  worldchainSupply: z.number().nonnegative().finite().optional(),
  baseSupply: z.number().nonnegative().finite().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get("asset") ?? DEFAULT_ASSET;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "500", 10), 2000);
    const from = searchParams.get("from"); // YYYY-MM-DD
    const to = searchParams.get("to");   // YYYY-MM-DD

    const where: { asset: string; snapshotAt?: { gte?: Date; lte?: Date } } = { asset };
    if (from) {
      const fromDate = new Date(from + "T00:00:00.000Z");
      if (!Number.isNaN(fromDate.getTime())) {
        where.snapshotAt = { ...where.snapshotAt, gte: fromDate };
      }
    }
    if (to) {
      const toDate = new Date(to + "T23:59:59.999Z");
      if (!Number.isNaN(toDate.getTime())) {
        where.snapshotAt = { ...where.snapshotAt, lte: toDate };
      }
    }

    const snapshots = await prisma.supplySnapshot.findMany({
      where,
      orderBy: { snapshotAt: "desc" },
      take: limit,
    });

    const data = snapshots.map((s) => ({
      id: s.id,
      asset: s.asset,
      total: Number(s.total),
      chainsJson: s.chainsJson,
      snapshotAt: s.snapshotAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error("[supply/snapshots GET]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo ADMIN puede crear snapshots" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Body JSON inválido" },
        { status: 400 }
      );
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Fecha y total son requeridos; total debe ser positivo." },
        { status: 400 }
      );
    }

    const d = new Date(
      parsed.data.snapshotAt.includes("T")
        ? parsed.data.snapshotAt
        : parsed.data.snapshotAt + "T00:00:00.000Z"
    );
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { success: false, error: "Fecha inválida" },
        { status: 400 }
      );
    }

    const eth = parsed.data.ethereumSupply ?? 0;
    const world = parsed.data.worldchainSupply ?? 0;
    const base = parsed.data.baseSupply ?? 0;
    const total = parsed.data.total;

    const chainsJson = {
      ethereum: { supply: eth, success: true },
      worldchain: { supply: world, success: true },
      base: { supply: base, success: true },
      source: "manual",
    };

    const created = await prisma.supplySnapshot.create({
      data: {
        asset: DEFAULT_ASSET,
        total,
        chainsJson: chainsJson as unknown as object,
        snapshotAt: d,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        asset: created.asset,
        total: Number(created.total),
        chainsJson: created.chainsJson,
        snapshotAt: created.snapshotAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[supply/snapshots POST]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al crear snapshot",
      },
      { status: 500 }
    );
  }
}
