"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Database,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Shield,
  ChevronDown,
  ChevronUp,
  Activity,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TokenLogo } from "@/components/ui/TokenLogo";

type InstrumentoTipo = "FCI" | "Cuenta_Remunerada" | "A_la_Vista";

interface AllocationRow {
  id: string;
  asset: string;
  tipo: InstrumentoTipo;
  nombre: string;
  entidad: string | null;
  cantidadCuotasPartes: number;
  valorCuotaparte: number;
  valorTotal: number;
  fecha: string;
  rendimientoDiario: number | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

const TIPOS_OPTIONS: { value: InstrumentoTipo; label: string }[] = [
  { value: "FCI", label: "FCI" },
  { value: "Cuenta_Remunerada", label: "Cuenta Remunerada" },
  { value: "A_la_Vista", label: "A la Vista" },
];

function formatNum(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** Fecha de hoy en zona horaria local del navegador (YYYY-MM-DD). Evita que a las 23h ART se muestre el día siguiente por UTC. */
function getLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parsea número aceptando formato es-AR (1.000,50 o 1.000) o en (1,000.50). Devuelve NaN si no es válido. */
function parseDecimalInput(input: string): number {
  const trimmed = input.trim().replace(/\s/g, "");
  if (trimmed === "") return NaN;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Coma como decimal (es-AR): "1.000,50" -> quitar puntos de miles, coma -> punto
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    return parseFloat(normalized);
  }
  if (lastDot !== -1) {
    const afterDot = trimmed.slice(lastDot + 1);
    const hasComma = trimmed.includes(",");
    if (hasComma) {
      // "1,000.50" -> quitar comas de miles
      return parseFloat(trimmed.replace(/,/g, ""));
    }
    // Sin coma: "1.000" (miles) o "1.5" (decimal). Si tras el punto hay exactamente 3 dígitos, asumir miles.
    if (/^\d{3}$/.test(afterDot) && !trimmed.slice(0, lastDot).includes(".")) {
      const normalized = trimmed.replace(".", "");
      return parseFloat(normalized);
    }
    return parseFloat(trimmed);
  }
  if (trimmed.includes(",")) {
    return parseFloat(trimmed.replace(/,/g, ""));
  }
  return parseFloat(trimmed);
}

export default function DataPage(): React.ReactElement {
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [allocationsLoading, setAllocationsLoading] = useState(true);
  const [allocationsError, setAllocationsError] = useState<string | null>(null);
  const [fechaFilter, setFechaFilter] = useState<string>(""); // YYYY-MM-DD vacío = todas

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    tipo: "FCI" as InstrumentoTipo,
    nombre: "",
    entidad: "",
    cantidadCuotasPartes: "",
    valorCuotaparte: "",
    fecha: new Date().toISOString().slice(0, 10),
    activo: true,
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [collateralOpen, setCollateralOpen] = useState(false);

  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; data?: { rowsFromSheet?: number; created?: number; updated?: number } } | null>(null);

  // --- Supply Snapshots ---
  interface SupplySnapshotRow {
    id: string;
    asset: string;
    total: number;
    chainsJson: Record<string, unknown>;
    snapshotAt: string;
    createdAt: string;
  }
  const [supplySnapshots, setSupplySnapshots] = useState<SupplySnapshotRow[]>([]);
  const [supplySnapshotsLoading, setSupplySnapshotsLoading] = useState(false);
  const [supplySnapshotsOpen, setSupplySnapshotsOpen] = useState(false);
  const [supplyImportLoading, setSupplyImportLoading] = useState(false);
  const [supplyImportResult, setSupplyImportResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [supplyManualLoading, setSupplyManualLoading] = useState(false);
  const [supplyManualResult, setSupplyManualResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [supplyEditSnapshot, setSupplyEditSnapshot] = useState<SupplySnapshotRow | null>(null);
  const [supplyEditTotal, setSupplyEditTotal] = useState("");
  const [supplyEditDate, setSupplyEditDate] = useState("");
  const [supplyEditEthereum, setSupplyEditEthereum] = useState("");
  const [supplyEditWorldchain, setSupplyEditWorldchain] = useState("");
  const [supplyEditBase, setSupplyEditBase] = useState("");
  const [supplyEditSubmitting, setSupplyEditSubmitting] = useState(false);
  const [supplyEditError, setSupplyEditError] = useState<string | null>(null);
  const [supplyDateFrom, setSupplyDateFrom] = useState("");
  const [supplyDateTo, setSupplyDateTo] = useState("");
  const [supplyAddOpen, setSupplyAddOpen] = useState(false);

  const fetchSupplySnapshots = useCallback(async (): Promise<void> => {
    setSupplySnapshotsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (supplyDateFrom) params.set("from", supplyDateFrom);
      if (supplyDateTo) params.set("to", supplyDateTo);
      const res = await fetch(`/api/supply/snapshots?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setSupplySnapshots(json.data);
      }
    } catch {
      // silently ignore
    } finally {
      setSupplySnapshotsLoading(false);
    }
  }, [supplyDateFrom, supplyDateTo]);

  const handleImportSupplyFromSheet = async (): Promise<void> => {
    setSupplyImportLoading(true);
    setSupplyImportResult(null);
    try {
      const res = await fetch("/api/supply/import-from-sheet", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSupplyImportResult({
          success: true,
          message: `Importados ${json.imported} snapshots (${json.range?.from} → ${json.range?.to}).`,
        });
        fetchSupplySnapshots();
      } else {
        setSupplyImportResult({ success: false, message: json.error ?? "Error al importar" });
      }
    } catch (err) {
      setSupplyImportResult({
        success: false,
        message: err instanceof Error ? err.message : "Error de conexión",
      });
    } finally {
      setSupplyImportLoading(false);
    }
  };

  const handleManualSupplySnapshot = async (): Promise<void> => {
    setSupplyManualLoading(true);
    setSupplyManualResult(null);
    try {
      const res = await fetch("/api/cron/supply-snapshot");
      const json = await res.json();
      if (json.success) {
        setSupplyManualResult({
          success: true,
          message: `Snapshot guardado: ${json.date} — Total: ${formatNum(json.total)} wARS`,
        });
        fetchSupplySnapshots();
      } else {
        setSupplyManualResult({ success: false, message: json.error ?? "Error" });
      }
    } catch (err) {
      setSupplyManualResult({
        success: false,
        message: err instanceof Error ? err.message : "Error de conexión",
      });
    } finally {
      setSupplyManualLoading(false);
    }
  };

  const chainsFromSnap = (snap: SupplySnapshotRow): { ethereum: number; worldchain: number; base: number } => {
    const c = snap.chainsJson as Record<string, { supply?: number }>;
    return {
      ethereum: c?.ethereum?.supply ?? 0,
      worldchain: c?.worldchain?.supply ?? 0,
      base: c?.base?.supply ?? 0,
    };
  };

  const openSupplyEdit = (snap: SupplySnapshotRow): void => {
    setSupplyAddOpen(false);
    setSupplyEditSnapshot(snap);
    setSupplyEditTotal(String(snap.total));
    setSupplyEditDate(snap.snapshotAt.slice(0, 10));
    const chains = chainsFromSnap(snap);
    setSupplyEditEthereum(chains.ethereum ? String(chains.ethereum) : "");
    setSupplyEditWorldchain(chains.worldchain ? String(chains.worldchain) : "");
    setSupplyEditBase(chains.base ? String(chains.base) : "");
    setSupplyEditError(null);
  };

  const openSupplyAdd = (): void => {
    setSupplyEditSnapshot(null);
    setSupplyAddOpen(true);
    setSupplyEditDate(getLocalDateString());
    setSupplyEditTotal("");
    setSupplyEditEthereum("");
    setSupplyEditWorldchain("");
    setSupplyEditBase("");
    setSupplyEditError(null);
  };

  const closeSupplyEdit = (): void => {
    setSupplyEditSnapshot(null);
    setSupplyAddOpen(false);
    setSupplyEditError(null);
  };

  const handleSupplyEditSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const total = parseDecimalInput(supplyEditTotal);
    if (Number.isNaN(total) || total <= 0) {
      setSupplyEditError("El total debe ser un número mayor a 0 (ej. 568000000).");
      return;
    }
    if (!supplyAddOpen && !supplyEditSnapshot) return;
    if (supplyAddOpen && !supplyEditDate) {
      setSupplyEditError("La fecha es obligatoria.");
      return;
    }
    const eth = parseDecimalInput(supplyEditEthereum);
    const world = parseDecimalInput(supplyEditWorldchain);
    const base = parseDecimalInput(supplyEditBase);
    if (!Number.isNaN(eth) && eth < 0) {
      setSupplyEditError("Ethereum no puede ser negativo.");
      return;
    }
    if (!Number.isNaN(world) && world < 0) {
      setSupplyEditError("Worldchain no puede ser negativo.");
      return;
    }
    if (!Number.isNaN(base) && base < 0) {
      setSupplyEditError("Base no puede ser negativo.");
      return;
    }
    setSupplyEditSubmitting(true);
    setSupplyEditError(null);
    try {
      if (supplyAddOpen) {
        const body = {
          snapshotAt: supplyEditDate + "T00:00:00.000Z",
          total,
          ...(!Number.isNaN(eth) && { ethereumSupply: eth }),
          ...(!Number.isNaN(world) && { worldchainSupply: world }),
          ...(!Number.isNaN(base) && { baseSupply: base }),
        };
        const res = await fetch("/api/supply/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success) {
          closeSupplyEdit();
          fetchSupplySnapshots();
        } else {
          setSupplyEditError(json.error ?? "Error al crear");
        }
      } else if (supplyEditSnapshot) {
        const body: {
          total: number;
          snapshotAt?: string;
          ethereumSupply?: number;
          worldchainSupply?: number;
          baseSupply?: number;
        } = { total };
        if (supplyEditDate) body.snapshotAt = supplyEditDate + "T00:00:00.000Z";
        if (!Number.isNaN(eth)) body.ethereumSupply = eth;
        if (!Number.isNaN(world)) body.worldchainSupply = world;
        if (!Number.isNaN(base)) body.baseSupply = base;
        const res = await fetch(`/api/supply/snapshots/${supplyEditSnapshot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success) {
          closeSupplyEdit();
          fetchSupplySnapshots();
        } else {
          setSupplyEditError(json.error ?? "Error al guardar");
        }
      }
    } catch (err) {
      setSupplyEditError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setSupplyEditSubmitting(false);
    }
  };

  const fetchAllocations = useCallback(async (): Promise<void> => {
    setAllocationsLoading(true);
    setAllocationsError(null);
    try {
      const url = fechaFilter
        ? `/api/collateral/allocations?fecha=${encodeURIComponent(fechaFilter)}`
        : "/api/collateral/allocations";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setAllocations(json.data);
      } else {
        setAllocationsError(json.error ?? "Error al cargar");
      }
    } catch (err) {
      setAllocationsError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setAllocationsLoading(false);
    }
  }, [fechaFilter]);

  useEffect(() => {
    fetchAllocations();
  }, [fetchAllocations]);

  useEffect(() => {
    if (supplySnapshotsOpen) fetchSupplySnapshots();
  }, [supplySnapshotsOpen, supplyDateFrom, supplyDateTo, fetchSupplySnapshots]);

  const handleOpenNew = (): void => {
    setEditingId(null);
    setForm({
      tipo: "FCI",
      nombre: "",
      entidad: "",
      cantidadCuotasPartes: "",
      valorCuotaparte: "",
      fecha: new Date().toISOString().slice(0, 10),
      activo: true,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (row: AllocationRow): void => {
    setEditingId(row.id);
    setForm({
      tipo: row.tipo,
      nombre: row.nombre,
      entidad: row.entidad ?? "",
      cantidadCuotasPartes: String(row.cantidadCuotasPartes),
      valorCuotaparte: String(row.valorCuotaparte),
      fecha: row.fecha,
      activo: row.activo,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFormError(null);
    const cant = parseDecimalInput(form.cantidadCuotasPartes);
    const valor = parseDecimalInput(form.valorCuotaparte);
    if (Number.isNaN(cant) || cant <= 0) {
      setFormError("Cantidad de cuotas/partes debe ser un número mayor a 0 (ej. 1000 o 1.000,50).");
      return;
    }
    if (Number.isNaN(valor) || valor < 0) {
      setFormError("Valor cuotaparte debe ser un número mayor o igual a 0 (ej. 150,50 o 150.50).");
      return;
    }
    setFormSubmitting(true);
    try {
      const body = {
        asset: "wARS",
        tipo: form.tipo,
        nombre: form.nombre.trim(),
        entidad: form.entidad.trim() || null,
        cantidadCuotasPartes: cant,
        valorCuotaparte: valor,
        fecha: form.fecha,
        activo: form.activo,
      };
      if (editingId) {
        const res = await fetch(`/api/collateral/allocations/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success) {
          setFormOpen(false);
          fetchAllocations();
        } else {
          setFormError(json.error ?? "Error al guardar");
        }
      } else {
        const res = await fetch("/api/collateral/allocations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success) {
          setFormOpen(false);
          fetchAllocations();
        } else {
          setFormError(json.error ?? "Error al crear");
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      const res = await fetch(`/api/collateral/allocations/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setDeleteConfirmId(null);
        fetchAllocations();
      } else {
        setFormError(json.error ?? "Error al eliminar");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error de conexión");
    }
  };

  const handleImportFromSheet = async (): Promise<void> => {
    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/collateral/import-from-sheet", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setImportResult({
          success: true,
          message: json.data?.message ?? "Importado correctamente.",
          data: json.data,
        });
        fetchAllocations();
      } else {
        setImportResult({ success: false, message: json.error ?? "Error al importar" });
      }
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : "Error de conexión",
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#010103]/10 bg-[#FFFFFF] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-[#010103]">Data</h1>
          <p className="text-[#010103]/70 mt-1">
            Gestión del colateral alocado y snapshots.
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Supply Snapshots — desplegable */}
        <section className="rounded-lg border border-[#010103]/10 bg-[#FFFFFF] overflow-hidden">
          <button
            type="button"
            onClick={() => setSupplySnapshotsOpen((o) => !o)}
            className="w-full flex flex-wrap items-center justify-between gap-4 p-6 text-left hover:bg-[#010103]/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Activity className="size-8 text-[#5f6e78]" />
              <div>
                <h2 className="font-semibold text-lg text-[#010103]">Supply Snapshots</h2>
                <p className="text-sm text-[#010103]/70 flex items-center gap-1.5">
                  <TokenLogo tokenId="wARS" size={18} />
                  Historial de supply de wARS por chain. Snapshot diario automático a las 00:00 ART.
                </p>
              </div>
            </div>
            <span className="text-[#010103]/60">
              {supplySnapshotsOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
            </span>
          </button>
          {supplySnapshotsOpen && (
            <div className="border-t border-[#010103]/10 p-6 pt-4">
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-[#010103]/70">Desde:</label>
                  <input
                    type="date"
                    value={supplyDateFrom}
                    onChange={(e) => setSupplyDateFrom(e.target.value)}
                    className="rounded-lg border border-[#010103]/20 px-3 py-1.5 text-[#010103] text-sm"
                  />
                  <label className="text-sm text-[#010103]/70">Hasta:</label>
                  <input
                    type="date"
                    value={supplyDateTo}
                    onChange={(e) => setSupplyDateTo(e.target.value)}
                    className="rounded-lg border border-[#010103]/20 px-3 py-1.5 text-[#010103] text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-[#010103]/20"
                    onClick={() => { setSupplyDateFrom(""); setSupplyDateTo(""); }}
                  >
                    Limpiar fechas
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Button
                  type="button"
                  onClick={openSupplyAdd}
                  variant="outline"
                  className="border-[#5f6e78] text-[#5f6e78] hover:bg-[#5f6e78]/10"
                >
                  <Plus className="size-4" />
                  Agregar por fecha
                </Button>
                <Button
                  type="button"
                  onClick={handleImportSupplyFromSheet}
                  disabled={supplyImportLoading}
                  variant="outline"
                  className="border-[#5f6e78] text-[#5f6e78] hover:bg-[#5f6e78]/10"
                >
                  {supplyImportLoading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {supplyImportLoading ? "Importando..." : "Importar histórico del Sheet"}
                </Button>
                <Button
                  type="button"
                  onClick={handleManualSupplySnapshot}
                  disabled={supplyManualLoading}
                  className="bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                >
                  {supplyManualLoading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Activity className="size-4" />
                  )}
                  {supplyManualLoading ? "Tomando snapshot..." : "Snapshot ahora (blockchain)"}
                </Button>
              </div>

              {supplyImportResult && (
                <div
                  className={`mb-4 flex items-start gap-3 p-4 rounded-lg border ${
                    supplyImportResult.success
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {supplyImportResult.success ? (
                    <CheckCircle className="size-5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-5 shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm">{supplyImportResult.message}</p>
                </div>
              )}

              {supplyManualResult && (
                <div
                  className={`mb-4 flex items-start gap-3 p-4 rounded-lg border ${
                    supplyManualResult.success
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {supplyManualResult.success ? (
                    <CheckCircle className="size-5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-5 shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm">{supplyManualResult.message}</p>
                </div>
              )}

              {supplySnapshotsLoading ? (
                <div className="flex items-center gap-2 py-8 text-[#010103]/70">
                  <RefreshCw className="size-5 animate-spin" />
                  Cargando snapshots...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-[#010103]/20">
                        <th className="text-left py-2 px-2 text-[#010103]/80">Fecha</th>
                        <th className="text-right py-2 px-2 text-[#010103]/80">
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            Total <TokenLogo tokenId="wARS" size={16} /> wARS
                          </span>
                        </th>
                        <th className="text-right py-2 px-2 text-[#010103]/80">Ethereum</th>
                        <th className="text-right py-2 px-2 text-[#010103]/80">Worldchain</th>
                        <th className="text-right py-2 px-2 text-[#010103]/80">Base</th>
                        <th className="text-left py-2 px-2 text-[#010103]/80">Fuente</th>
                        <th className="text-left py-2 px-2 text-[#010103]/80 w-20">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplySnapshots.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-[#010103]/60">
                            No hay snapshots. Importá el histórico del Sheet o tomá un snapshot manual.
                          </td>
                        </tr>
                      ) : (
                        supplySnapshots.map((snap) => {
                          const chains = snap.chainsJson as Record<string, { supply?: number }>;
                          const ethSupply = chains?.ethereum?.supply;
                          const worldSupply = chains?.worldchain?.supply;
                          const baseSupply = chains?.base?.supply;
                          const source = (snap.chainsJson as Record<string, unknown>)?.source as string | undefined;
                          return (
                            <tr key={snap.id} className="border-b border-[#010103]/10 hover:bg-[#010103]/5">
                              <td className="py-2 px-2">{formatDate(snap.snapshotAt.slice(0, 10))}</td>
                              <td className="py-2 px-2 text-right font-medium">{formatNum(snap.total)}</td>
                              <td className="py-2 px-2 text-right">{ethSupply != null ? formatNum(ethSupply) : "—"}</td>
                              <td className="py-2 px-2 text-right">{worldSupply != null ? formatNum(worldSupply) : "—"}</td>
                              <td className="py-2 px-2 text-right">{baseSupply != null ? formatNum(baseSupply) : "—"}</td>
                              <td className="py-2 px-2 text-[#010103]/60 text-xs">
                                {source === "sheet-import" ? "Sheet" : source === "cron" ? "Cron" : "Manual"}
                              </td>
                              <td className="py-2 px-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-[#5f6e78] text-[#5f6e78] hover:bg-[#5f6e78]/10 h-8"
                                  onClick={() => openSupplyEdit(snap)}
                                >
                                  <Pencil className="size-4" />
                                  Editar
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  {supplySnapshots.length > 0 && (
                    <p className="text-xs text-[#010103]/50 mt-2">{supplySnapshots.length} snapshots</p>
                  )}
                </div>
              )}

              {/* Modal editar supply total */}
              {(supplyEditSnapshot || supplyAddOpen) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010103]/40 p-4" role="dialog" aria-modal="true" aria-labelledby="supply-edit-title">
                  <div className="bg-[#FFFFFF] rounded-lg border border-[#010103]/10 shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                    <h2 id="supply-edit-title" className="text-lg font-semibold text-[#010103] mb-2">
                      {supplyAddOpen ? "Agregar snapshot" : "Editar snapshot"}
                    </h2>
                    <p className="text-sm text-[#010103]/70 mb-4">
                      {supplyAddOpen
                        ? "El gráfico Evolución del ratio de colateralización usa esta data."
                        : "El gráfico de ratio de colateralización usa estos valores."}
                    </p>
                    <form onSubmit={handleSupplyEditSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="supply-edit-date" className="block text-sm font-medium text-[#010103] mb-1">
                          Fecha
                        </label>
                        <input
                          id="supply-edit-date"
                          type="date"
                          value={supplyEditDate}
                          onChange={(e) => setSupplyEditDate(e.target.value)}
                          className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103] text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                        />
                      </div>
                      <div>
                        <label htmlFor="supply-edit-total" className="block text-sm font-medium text-[#010103] mb-1 flex items-center gap-1.5">
                          Total <TokenLogo tokenId="wARS" size={18} /> wARS
                        </label>
                        <input
                          id="supply-edit-total"
                          type="text"
                          inputMode="decimal"
                          value={supplyEditTotal}
                          onChange={(e) => setSupplyEditTotal(e.target.value)}
                          className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103] text-sm focus:outline-none focus:ring-2 focus:ring-[#5f6e78]"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label htmlFor="supply-edit-eth" className="block text-sm font-medium text-[#010103] mb-1">Ethereum</label>
                          <input
                            id="supply-edit-eth"
                            type="text"
                            inputMode="decimal"
                            value={supplyEditEthereum}
                            onChange={(e) => setSupplyEditEthereum(e.target.value)}
                            className="w-full rounded-lg border border-[#010103]/20 px-2 py-1.5 text-[#010103] text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="supply-edit-world" className="block text-sm font-medium text-[#010103] mb-1">Worldchain</label>
                          <input
                            id="supply-edit-world"
                            type="text"
                            inputMode="decimal"
                            value={supplyEditWorldchain}
                            onChange={(e) => setSupplyEditWorldchain(e.target.value)}
                            className="w-full rounded-lg border border-[#010103]/20 px-2 py-1.5 text-[#010103] text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="supply-edit-base" className="block text-sm font-medium text-[#010103] mb-1">Base</label>
                          <input
                            id="supply-edit-base"
                            type="text"
                            inputMode="decimal"
                            value={supplyEditBase}
                            onChange={(e) => setSupplyEditBase(e.target.value)}
                            className="w-full rounded-lg border border-[#010103]/20 px-2 py-1.5 text-[#010103] text-sm"
                          />
                        </div>
                      </div>
                      {supplyEditError && (
                        <p className="text-sm text-red-600">{supplyEditError}</p>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-[#010103]/20"
                          onClick={closeSupplyEdit}
                          disabled={supplyEditSubmitting}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          className="bg-[#5f6e78] hover:bg-[#5f6e78]/90"
                          disabled={supplyEditSubmitting}
                        >
                          {supplyEditSubmitting ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Gestión de colateral — desplegable */}
        <section className="rounded-lg border border-[#010103]/10 bg-[#FFFFFF] overflow-hidden">
          <button
            type="button"
            onClick={() => setCollateralOpen((o) => !o)}
            className="w-full flex flex-wrap items-center justify-between gap-4 p-6 text-left hover:bg-[#010103]/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="size-8 text-[#5f6e78]" />
              <div>
                <h2 className="font-semibold text-lg text-[#010103]">Gestión de colateral</h2>
                <p className="text-sm text-[#010103]/70">
                  Líneas de colateral: tipo, cantidad de cuotas/partes, valor cuotaparte, fecha.
                </p>
              </div>
            </div>
            <span className="text-[#010103]/60">
              {collateralOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
            </span>
          </button>
          {collateralOpen && (
            <div className="border-t border-[#010103]/10 p-6 pt-0">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#010103]/70">Fecha:</label>
              <input
                type="date"
                value={fechaFilter}
                onChange={(e) => setFechaFilter(e.target.value)}
                className="rounded-lg border border-[#010103]/20 px-3 py-1.5 text-[#010103] text-sm"
              />
              <span className="text-xs text-[#010103]/50">(vacío = todas)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleImportFromSheet}
                disabled={importLoading}
                variant="outline"
                className="border-[#5f6e78] text-[#5f6e78] hover:bg-[#5f6e78]/10"
              >
                {importLoading ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Database className="size-4" />
                )}
                {importLoading ? "Importando..." : "Importar desde Sheet"}
              </Button>
              <Button
                type="button"
                onClick={handleOpenNew}
                className="bg-[#5f6e78] hover:bg-[#5f6e78]/90"
              >
                <Plus className="size-4" />
                Nueva línea
              </Button>
            </div>
          </div>
          {importResult && (
            <div
              className={`mb-4 flex items-start gap-3 p-4 rounded-lg border ${
                importResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {importResult.success ? (
                <CheckCircle className="size-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-5 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{importResult.success ? "Importación" : "Error"}</p>
                <p className="text-sm mt-1">{importResult.message}</p>
                {importResult.data?.created != null && (
                  <p className="text-xs mt-1">
                    {importResult.data.created} creados, {importResult.data.updated ?? 0} actualizados.
                  </p>
                )}
              </div>
            </div>
          )}

          {formOpen && (
            <form
              onSubmit={handleSubmitForm}
              className="mb-6 p-4 rounded-lg bg-[#010103]/5 border border-[#010103]/10 space-y-4"
            >
              <h3 className="font-medium text-[#010103]">
                {editingId ? "Editar línea" : "Nueva línea de colateral"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#010103] mb-1">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as InstrumentoTipo }))}
                    className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103]"
                    required
                  >
                    {TIPOS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#010103] mb-1">Nombre</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103]"
                    placeholder="ej. Adcap Ahorro Pesos - Clase B"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#010103] mb-1">Entidad</label>
                  <input
                    type="text"
                    value={form.entidad}
                    onChange={(e) => setForm((f) => ({ ...f, entidad: e.target.value }))}
                    className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103]"
                    placeholder="ej. Banco Comercio"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#010103] mb-1">Fecha</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#010103] mb-1">Cantidad cuotas/partes</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.cantidadCuotasPartes}
                    onChange={(e) => setForm((f) => ({ ...f, cantidadCuotasPartes: e.target.value }))}
                    className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103]"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#010103] mb-1">Valor cuotaparte</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.valorCuotaparte}
                    onChange={(e) => setForm((f) => ({ ...f, valorCuotaparte: e.target.value }))}
                    className="w-full rounded-lg border border-[#010103]/20 px-3 py-2 text-[#010103]"
                    placeholder="0"
                    required
                  />
                </div>
                <p className="text-xs text-[#010103]/60 col-span-full">
                  El rendimiento diario se calcula automáticamente: diferencia % entre el valor del día y el del día anterior.
                </p>
                <div className="flex items-center gap-2 pt-8">
                  <input
                    type="checkbox"
                    id="form-activo"
                    checked={form.activo}
                    onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                    className="rounded border-[#010103]/30"
                  />
                  <label htmlFor="form-activo" className="text-sm text-[#010103]">Activo</label>
                </div>
              </div>
              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={formSubmitting} className="bg-[#5f6e78] hover:bg-[#5f6e78]/90">
                  {formSubmitting ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                  disabled={formSubmitting}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {allocationsError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {allocationsError}
            </div>
          )}
          {allocationsLoading ? (
            <div className="flex items-center gap-2 py-8 text-[#010103]/70">
              <RefreshCw className="size-5 animate-spin" />
              Cargando líneas...
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#010103]/20">
                      <th className="text-left py-2 px-2 text-[#010103]/80">Fecha</th>
                      <th className="text-left py-2 px-2 text-[#010103]/80">Tipo</th>
                      <th className="text-left py-2 px-2 text-[#010103]/80">Nombre</th>
                      <th className="text-left py-2 px-2 text-[#010103]/80">Entidad</th>
                      <th className="text-right py-2 px-2 text-[#010103]/80">Cant. cuotas</th>
                      <th className="text-right py-2 px-2 text-[#010103]/80">Valor cuotaparte</th>
                      <th className="text-right py-2 px-2 text-[#010103]/80">Valor total</th>
                      <th className="text-right py-2 px-2 text-[#010103]/80" title="Calculado: (valor hoy − valor ayer) / valor ayer × 100">Rend. %</th>
                      <th className="text-center py-2 px-2 text-[#010103]/80">Activo</th>
                      <th className="text-right py-2 px-2 text-[#010103]/80">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-[#010103]/60">
                          No hay líneas de colateral. Agregá una con &quot;Nueva línea&quot;.
                        </td>
                      </tr>
                    ) : (
                      allocations.map((row) => (
                        <tr key={row.id} className="border-b border-[#010103]/10 hover:bg-[#010103]/5">
                          <td className="py-2 px-2">{formatDate(row.fecha)}</td>
                          <td className="py-2 px-2">{row.tipo}</td>
                          <td className="py-2 px-2">{row.nombre}</td>
                          <td className="py-2 px-2">{row.entidad ?? "—"}</td>
                          <td className="py-2 px-2 text-right">{formatNum(row.cantidadCuotasPartes)}</td>
                          <td className="py-2 px-2 text-right">{formatNum(row.valorCuotaparte)}</td>
                          <td className="py-2 px-2 text-right font-medium">{formatNum(row.valorTotal)}</td>
                          <td className="py-2 px-2 text-right">
                            {row.rendimientoDiario != null ? `${formatNum(row.rendimientoDiario)}%` : "—"}
                          </td>
                          <td className="py-2 px-2 text-center">{row.activo ? "Sí" : "No"}</td>
                          <td className="py-2 px-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(row)}
                              className="p-1.5 text-[#5f6e78] hover:bg-[#5f6e78]/10 rounded"
                              title="Editar"
                            >
                              <Pencil className="size-4" />
                            </button>
                            {deleteConfirmId === row.id ? (
                              <span className="inline-flex gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(row.id)}
                                  className="text-xs text-red-600 font-medium"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-[#010103]/70"
                                >
                                  Cancelar
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(row.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"
                                title="Eliminar"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
