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

    const chainsJson = existing.chainsJson as Record<string, { supply?: number; success?: boolean }>;
    const baseChains = {
      ethereum: { supply: chainsJson?.ethereum?.supply ?? 0, success: chainsJson?.ethereum?.success ?? true },
      worldchain: { supply: chainsJson?.worldchain?.supply ?? 0, success: chainsJson?.worldchain?.success ?? true },
      base: { supply: chainsJson?.base?.supply ?? 0, success: chainsJson?.base?.success ?? true },
      source: (chainsJson?.source as string) ?? "cron",
    };

    if (parsed.data.ethereumSupply !== undefined) baseChains.ethereum.supply = parsed.data.ethereumSupply;
    if (parsed.data.worldchainSupply !== undefined) baseChains.worldchain.supply = parsed.data.worldchainSupply;
    if (parsed.data.baseSupply !== undefined) baseChains.base.supply = parsed.data.baseSupply;

    const newTotal =
      parsed.data.total ??
      baseChains.ethereum.supply + baseChains.worldchain.supply + baseChains.base.supply;

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
        error: error instanceof Error ? error.message : "Error al actualizar",
      },
      { status: 500 }
    );
  }
}
