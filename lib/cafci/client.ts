// lib/cafci/client.ts
// Fetch cuotaparte del fondo Adcap Ahorro Pesos Clase B desde la API pública de CAFCI.

const CAFCI_BASE = "https://api.pub.cafci.org.ar/estadisticas/informacion/diaria/4";

interface CafciFund {
  fondo?: string;
  vcp?: number;
  [key: string]: unknown;
}

/**
 * Busca el valor de cuotaparte (vcp) del fondo Adcap Ahorro Pesos Clase B
 * para la fecha dada. Si no hay datos (finde/feriado), retrocede hasta 5 días.
 */
export async function fetchAdcapCuotaparte(
  date?: Date
): Promise<{ fecha: string; vcp: number } | null> {
  const start = date ?? new Date();

  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    try {
      const res = await fetch(`${CAFCI_BASE}/${dateStr}`, {
        headers: { Referer: "https://www.cafci.org.ar/" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;

      const body = await res.json();
      const items: CafciFund[] = Array.isArray(body)
        ? body
        : Array.isArray(body?.data)
          ? body.data
          : [];

      if (items.length === 0) continue;

      // "Adcap Ahorro Pesos Fondo de Dinero - Clase B" — match on fondo name
      const fund = items.find(
        (f) =>
          typeof f.fondo === "string" &&
          f.fondo.toLowerCase().includes("adcap ahorro pesos") &&
          f.fondo.toLowerCase().includes("clase b")
      );

      if (fund && typeof fund.vcp === "number" && fund.vcp > 0) {
        // CAFCI reports VCP in "thousands" scale (~18500). Our DB stores in
        // "units" scale (~18.5) after the 2026-04 VCP normalisation.
        // Divide by 1000 so the value matches the DB convention.
        return { fecha: dateStr, vcp: fund.vcp / 1000 };
      }
    } catch (err) {
      console.error(`[CAFCI] Error fetching ${dateStr}:`, err);
    }
  }

  return null;
}
