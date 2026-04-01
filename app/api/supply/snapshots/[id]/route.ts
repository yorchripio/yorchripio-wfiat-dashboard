// app/api/supply/snapshots/[id]/route.ts
// PATCH: actualiza el total (y opcionalmente chains_json) de un supply snapshot. Solo ADMIN.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasMinRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  total: z.number().positive().finite().optional(),
  snapshotAt: z.string().min(1).optional(),
  ethereumSupply: z.number().nonnegative().finite().optional(),
  worldchainSupply: z.number().nonnegative().finite().optional(),
  baseSupply: z.number().nonnegative().finite().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const role = session.user.role as "ADMIN" | "TRADER" | "VIEWER";
    if (!hasMinRole(role, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo ADMIN puede editar snapshots" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID requerido" },
        { status: 400 }
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

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const existing = await prisma.supplySnapshot.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Snapshot no encontrado" },
        { status: 404 }
      );
    }

    const chainsJson = existing.chainsJson as Record<string, { supply?: number; success?: boolean } | string>;
    const cj = chainsJson as Record<string, { supply?: number; success?: boolean }>;
    const baseChains: Record<string, { supply: number; success: boolean } | string> = {
      ethereum: { supply: cj?.ethereum?.supply ?? 0, success: cj?.ethereum?.success ?? true },
      worldchain: { supply: cj?.worldchain?.supply ?? 0, success: cj?.worldchain?.success ?? true },
      base: { supply: cj?.base?.supply ?? 0, success: cj?.base?.success ?? true },
      gnosis: { supply: cj?.gnosis?.supply ?? 0, success: cj?.gnosis?.success ?? true },
      polygon: { supply: cj?.polygon?.supply ?? 0, success: cj?.polygon?.success ?? true },
      bsc: { supply: cj?.bsc?.supply ?? 0, success: cj?.bsc?.success ?? true },
      source: (chainsJson?.source as string) ?? "cron",
    };

    const eth = baseChains.ethereum as { supply: number; success: boolean };
    const wc = baseChains.worldchain as { supply: number; success: boolean };
    const bs = baseChains.base as { supply: number; success: boolean };
    const gn = baseChains.gnosis as { supply: number; success: boolean };
    const pg = baseChains.polygon as { supply: number; success: boolean };
    const bn = baseChains.bsc as { supply: number; success: boolean };

    if (parsed.data.ethereumSupply !== undefined) eth.supply = parsed.data.ethereumSupply;
    if (parsed.data.worldchainSupply !== undefined) wc.supply = parsed.data.worldchainSupply;
    if (parsed.data.baseSupply !== undefined) bs.supply = parsed.data.baseSupply;

    const newTotal =
      parsed.data.total ??
      eth.supply + wc.supply + bs.supply + gn.supply + pg.supply + bn.supply;

    let snapshotAt: Date | undefined;
    if (parsed.data.snapshotAt) {
      const d = new Date(parsed.data.snapshotAt.includes("T") ? parsed.data.snapshotAt : parsed.data.snapshotAt + "T00:00:00.000Z");
      if (!Number.isNaN(d.getTime())) snapshotAt = d;
    }

    const updateData: Prisma.SupplySnapshotUpdateInput = {
      total: newTotal,
      chainsJson: baseChains as Prisma.InputJsonValue,
    };
    if (snapshotAt != null && !Number.isNaN(snapshotAt.getTime())) {
      updateData.snapshotAt = snapshotAt;
    }

    const updated = await prisma.supplySnapshot.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        asset: updated.asset,
        total: Number(updated.total),
        chainsJson: updated.chainsJson,
        snapshotAt: updated.snapshotAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[supply/snapshots PATCH]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al actualizar snapshot",
      },
      { status: 500 }
    );
  }
}
