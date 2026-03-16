"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TransactionPreview {
  fecha: string;
  descripcion: string;
  valor: number;
  saldo: number;
  tipo: string;
}

interface SnapshotPreview {
  periodoInicio: string;
  periodoFin: string;
  saldoFinal: number;
  capitalWcop: number;
  rendimientos: number;
  rendimientosTotalCuenta: number;
  retirosMM: number;
  depositosMM: number;
  impuestos: number;
  diasPeriodo: number;
  tna: number;
  tea: number;
}

interface MonthlyBreakdownItem {
  mes: string;
  rendTotalCuenta: number;
  rendWcop: number;
  tasaDiaria: number;
  tnaImplicita: number;
  fraccionWcop: number;
}

interface SavedSnapshot {
  id: string;
  fechaCorte: string;
  saldoFinal: number;
  capitalWcop: number;
  rendimientos: number;
  retirosMM: number;
  depositosMM: number;
  impuestos: number;
}

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

const tipoBadge: Record<string, { bg: string; text: string; label: string }> = {
  rendimiento: { bg: "bg-green-100", text: "text-green-800", label: "Rendimiento" },
  deposito_wcop: { bg: "bg-blue-100", text: "text-blue-800", label: "Dep. wCOP" },
  retiro_mm: { bg: "bg-red-100", text: "text-red-800", label: "Retiro MM" },
  deposito_mm: { bg: "bg-orange-100", text: "text-orange-800", label: "Dep. MM" },
  impuesto: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Impuesto" },
  otro: { bg: "bg-gray-100", text: "text-gray-800", label: "Otro" },
};

export function WcopDataSection({ onConfirmed }: { onConfirmed?: () => void }): React.ReactElement {
  const [sectionOpen, setSectionOpen] = useState(false);

  // Upload state
  const [extractoFile, setExtractoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview state (after upload, before confirm)
  const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotPreview | null>(null);
  const [previewTransactions, setPreviewTransactions] = useState<TransactionPreview[]>([]);
  const [previewMonthly, setPreviewMonthly] = useState<MonthlyBreakdownItem[]>([]);

  // Confirm state
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ success: boolean; message: string } | null>(null);

  // Saved snapshots
  const [savedSnapshots, setSavedSnapshots] = useState<SavedSnapshot[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const fetchSavedSnapshots = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/wcop/positions");
      const json = await res.json();
      if (json.success) {
        setSavedSnapshots(json.data);
      }
    } catch {
      // ignore
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sectionOpen && savedSnapshots.length === 0) {
      fetchSavedSnapshots();
    }
  }, [sectionOpen, savedSnapshots.length, fetchSavedSnapshots]);

  const handleUpload = async () => {
    if (!extractoFile) {
      setUploadError("Seleccioná el archivo CSV.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setConfirmResult(null);
    try {
      const formData = new FormData();
      formData.append("extracto", extractoFile);

      const res = await fetch("/api/wcop/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success) {
        setPreviewSnapshot(json.data.snapshot);
        setPreviewTransactions(json.data.transactions ?? []);
        setPreviewMonthly(json.data.monthlyBreakdown ?? []);
      } else {
        setUploadError(json.error || "Error procesando archivo");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error de conexion");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewSnapshot) return;
    setConfirming(true);
    setConfirmResult(null);
    try {
      const res = await fetch("/api/wcop/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: previewSnapshot }),
      });
      const json = await res.json();
      if (json.success) {
        setConfirmResult({
          success: true,
          message: `Snapshot guardado: ${formatDate(previewSnapshot.periodoInicio)} - ${formatDate(previewSnapshot.periodoFin)}, saldo ${formatCop(previewSnapshot.saldoFinal)}.`,
        });
        setPreviewSnapshot(null);
        setPreviewTransactions([]);
        setPreviewMonthly([]);
        setExtractoFile(null);
        fetchSavedSnapshots();
        onConfirmed?.();
      } else {
        setConfirmResult({ success: false, message: json.error || "Error guardando" });
      }
    } catch (err) {
      setConfirmResult({ success: false, message: err instanceof Error ? err.message : "Error" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section className="rounded-lg border border-[#010103]/10 bg-[#FFFFFF] overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionOpen((o) => !o)}
        className="w-full flex flex-wrap items-center justify-between gap-4 p-6 text-left hover:bg-[#010103]/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="size-8 text-[#f59e0b]" />
          <div>
            <h2 className="font-semibold text-lg text-[#010103]">wCOP - Cuenta Ahorro Finandina</h2>
            <p className="text-sm text-[#010103]/70">
              Cargar CSV del extracto de cuenta de ahorro Finandina (COP).
            </p>
          </div>
        </div>
        <span className="text-[#010103]/60">
          {sectionOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </span>
      </button>

      {sectionOpen && (
        <div className="border-t border-[#010103]/10 p-6 pt-4 space-y-6">
          {/* Upload area */}
          <div>
            <label className="block text-sm font-medium text-[#010103] mb-1">
              Extracto Finandina (CSV)
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setExtractoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[#010103]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#f59e0b]/10 file:text-[#f59e0b] hover:file:bg-[#f59e0b]/20"
            />
            {extractoFile && (
              <p className="text-xs text-[#010103]/50 mt-1">{extractoFile.name}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleUpload}
              disabled={uploading || !extractoFile}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-white"
            >
              {uploading ? (
                <RefreshCw className="size-4 animate-spin mr-2" />
              ) : (
                <Upload className="size-4 mr-2" />
              )}
              Procesar archivo
            </Button>
            {uploadError && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="size-4" /> {uploadError}
              </span>
            )}
          </div>

          {confirmResult && (
            <div
              className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                confirmResult.success
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {confirmResult.success ? (
                <CheckCircle className="size-4" />
              ) : (
                <AlertCircle className="size-4" />
              )}
              {confirmResult.message}
            </div>
          )}

          {/* Preview */}
          {previewSnapshot && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="rounded-xl border border-[#010103]/10 p-4">
                <h3 className="font-semibold text-[#010103] mb-3">Resumen del Extracto</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-[#010103]/60 text-xs">Periodo</p>
                    <p className="font-medium">
                      {formatDate(previewSnapshot.periodoInicio)} &rarr; {formatDate(previewSnapshot.periodoFin)}
                    </p>
                    <p className="text-[#010103]/50 text-xs">{previewSnapshot.diasPeriodo} dias</p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">Capital wCOP</p>
                    <p className="font-mono font-medium">{formatCop(previewSnapshot.capitalWcop)}</p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">Rend. wCOP (proporcional)</p>
                    <p className="font-mono font-medium text-emerald-700">{formatCop(previewSnapshot.rendimientos)}</p>
                    <p className="text-[#010103]/50 text-xs">de {formatCop(previewSnapshot.rendimientosTotalCuenta)} total</p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">TNA / TEA</p>
                    <p className="font-mono font-medium text-[#d4a017]">
                      {(previewSnapshot.tna * 100).toFixed(2)}% / {(previewSnapshot.tea * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">Saldo Final Cuenta</p>
                    <p className="font-mono font-medium">{formatCop(previewSnapshot.saldoFinal)}</p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">Retiros MM</p>
                    <p className="font-mono font-medium text-red-600">{formatCop(previewSnapshot.retirosMM)}</p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">Depositos MM</p>
                    <p className="font-mono font-medium text-orange-600">{formatCop(previewSnapshot.depositosMM)}</p>
                  </div>
                  <div>
                    <p className="text-[#010103]/60 text-xs">Impuestos (4x1000)</p>
                    <p className="font-mono font-medium text-yellow-700">{formatCop(previewSnapshot.impuestos)}</p>
                  </div>
                </div>

                {/* Monthly breakdown */}
                {previewMonthly.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[#010103]/10">
                    <h4 className="text-xs font-medium text-[#010103]/60 uppercase mb-2">Desglose Mensual (metodo proporcional)</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#010103]/60">
                            <th className="px-2 py-1 text-left">Mes</th>
                            <th className="px-2 py-1 text-right">Rend. Cuenta</th>
                            <th className="px-2 py-1 text-right">Rend. wCOP</th>
                            <th className="px-2 py-1 text-right">Frac. wCOP</th>
                            <th className="px-2 py-1 text-right">Tasa Diaria</th>
                            <th className="px-2 py-1 text-right">TNA impl.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewMonthly.map((m) => (
                            <tr key={m.mes} className="border-t border-[#010103]/5">
                              <td className="px-2 py-1 font-medium">{m.mes}</td>
                              <td className="px-2 py-1 text-right font-mono">{formatCop(m.rendTotalCuenta)}</td>
                              <td className="px-2 py-1 text-right font-mono text-emerald-700">{formatCop(m.rendWcop)}</td>
                              <td className="px-2 py-1 text-right font-mono">{(m.fraccionWcop * 100).toFixed(1)}%</td>
                              <td className="px-2 py-1 text-right font-mono">{(m.tasaDiaria * 100).toFixed(4)}%</td>
                              <td className="px-2 py-1 text-right font-mono text-[#d4a017]">{(m.tnaImplicita * 100).toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Transactions table (collapsible) */}
              {previewTransactions.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-[#010103]/70 hover:text-[#010103]">
                    {previewTransactions.length} transacciones del extracto
                  </summary>
                  <div className="mt-2 overflow-x-auto border rounded-lg border-[#010103]/10">
                    <table className="w-full text-sm">
                      <thead className="bg-[#010103]/5">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Fecha</th>
                          <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Descripcion</th>
                          <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Valor</th>
                          <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Saldo</th>
                          <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTransactions.map((t, i) => {
                          const badge = tipoBadge[t.tipo] ?? tipoBadge.otro;
                          return (
                            <tr key={i} className="border-t border-[#010103]/5">
                              <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.fecha)}</td>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={t.descripcion}>
                                {t.descripcion}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-mono ${
                                  t.valor < 0 ? "text-red-600" : "text-green-700"
                                }`}
                              >
                                {formatCop(t.valor)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">{formatCop(t.saldo)}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                                >
                                  {badge.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <Button
                onClick={handleConfirm}
                disabled={confirming}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-white"
              >
                {confirming ? (
                  <RefreshCw className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="size-4 mr-2" />
                )}
                Confirmar y guardar snapshot
              </Button>
            </div>
          )}

          {/* Saved snapshots */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[#010103]">Snapshots guardados</h3>
              <Button variant="outline" size="sm" onClick={fetchSavedSnapshots} disabled={savedLoading}>
                <RefreshCw className={`size-4 mr-1 ${savedLoading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </div>

            {savedSnapshots.length === 0 && !savedLoading && (
              <p className="text-sm text-[#010103]/50">No hay snapshots guardados aun.</p>
            )}

            {savedSnapshots.length > 0 && (
              <div className="overflow-x-auto border rounded-lg border-[#010103]/10">
                <table className="w-full text-sm">
                  <thead className="bg-[#010103]/5">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Fecha Corte</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Saldo Final</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Capital wCOP</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Rendimientos</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Retiros MM</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Impuestos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedSnapshots.map((s) => (
                      <tr key={s.id} className="border-t border-[#010103]/5">
                        <td className="px-3 py-2 font-medium">{formatDate(s.fechaCorte)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCop(s.saldoFinal)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCop(s.capitalWcop)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatCop(s.rendimientos)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">{formatCop(s.retirosMM)}</td>
                        <td className="px-3 py-2 text-right font-mono text-yellow-700">{formatCop(s.impuestos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
