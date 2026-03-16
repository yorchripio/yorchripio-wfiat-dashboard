// app/api/cron/refresh-pools/route.ts
import { NextRequest, NextResponse } from "next/server";
import { refreshPoolCache } from "@/lib/geckoterminal/refresh-cache";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET no definido" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const result = await refreshPoolCache();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/refresh-pools]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
