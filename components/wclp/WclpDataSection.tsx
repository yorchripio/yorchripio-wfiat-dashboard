// components/wclp/WclpDataSection.tsx
// Muestra colateral wCLP desde BCI + upload de extracto XLSX mensual.

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
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface WclpSummary {
  currency: string;
  amount: number;
  fechaCorte: string | null;
  entidad: string;
  rendimiento: number;
  cobertura: {
    supply: number | null;
    colateral: number;
    ratio: number | null;
  };
}

interface TransactionPreview {
  fecha: string;
  descripcion: string;
  cargo: number;
  abono: number;
  saldo: number;
}

interface SnapshotPreview {
  periodoInicio: string;
  periodoFin: string;
  saldoFinal: number;
  totalAbonos: number;
  totalCargos: number;
}

interface SavedSnapshot {
  id: string;
  fechaCorte: string;
  saldoFinal: number;
  totalAbonos: number;
  totalCargos: number;
}

function formatClp(n: number): string {
  return `$ ${Math.round(n).toLocaleString("es-CL")}`;
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export function WclpDataSection({ onConfirmed }: { onConfirmed?: () => void }): React.ReactElement {
  // BCI summary
  const [summaryData, setSummaryData] = useState<WclpSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Upload section
  const [sectionOpen, setSectionOpen] = useState(false);
  const [extractoFile, setExtractoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview
  const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotPreview | null>(null);
  const [previewTransactions, setPreviewTransactions] = useState<TransactionPreview[]>([]);

  // Confirm
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ success: boolean; message: string } | null>(null);

  // Saved snapshots
  const [savedSnapshots, setSavedSnapshots] = useState<SavedSnapshot[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const fetchSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/wclp/summary");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error cargando wCLP");
      setSummaryData(json.data);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Error de conexion");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSavedSnapshots = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/wclp/positions");
      const json = await res.json();
      if (json.success) setSavedSnapshots(json.data);
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
      setUploadError("Selecciona el archivo XLSX.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setConfirmResult(null);
    try {
      const formData = new FormData();
      formData.append("extracto", extractoFile);

      const res = await fetch("/api/wclp/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success) {
        setPreviewSnapshot(json.data.snapshot);
        setPreviewTransactions(json.data.transactions ?? []);
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
      const res = await fetch("/api/wclp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: previewSnapshot }),
      });
      const json = await res.json();
      if (json.success) {
        setConfirmResult({
          success: true,
          message: `Snapshot guardado: ${formatDate(previewSnapshot.periodoInicio)} - ${formatDate(previewSnapshot.periodoFin)}, saldo ${formatClp(previewSnapshot.saldoFinal)}.`,
        });
        setPreviewSnapshot(null);
        setPreviewTransactions([]);
        setExtractoFile(null);
        fetchSavedSnapshots();
        fetchSummary();
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

  const ratioColor =
    summaryData?.cobertura.ratio == null
      ? "text-[#010103]/50"
      : summaryData.cobertura.ratio >= 100
        ? "text-green-600"
        : summaryData.cobertura.ratio >= 90
          ? "text-yellow-600"
          : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Balance card from BCI */}
      {summaryLoading && !summaryData && (
        <div className="flex items-center justify-center py-12 text-[#010103]/50">
          <RefreshCw className="size-5 animate-spin mr-2" />
          Cargando colateral BCI...
        </div>
      )}

      {summaryError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="size-5 shrink-0" />
          <span>{summaryError}</span>
        </div>
      )}

      {summaryData && (
        <>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Wallet className="size-6 text-[#0033A0]" />
                <div>
                  <h2 className="text-lg font-semibold text-[#010103]">Cuenta Corriente BCI</h2>
                  <p className="text-sm text-[#010103]/60">
                    Colateral wCLP — cuenta corriente (sin rendimiento)
                    {summaryData.fechaCorte && ` — corte ${formatDate(summaryData.fechaCorte)}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchSummary}
                disabled={summaryLoading}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#5f6e78] text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
              >
                <RefreshCw className={`size-4 ${summaryLoading ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Saldo</p>
                <p className="text-2xl font-bold text-[#010103]">{formatClp(summaryData.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Entidad</p>
                <p className="text-lg font-semibold text-[#010103]">{summaryData.entidad}</p>
              </div>
              <div>
                <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Rendimiento</p>
                <p className="text-lg font-semibold text-[#010103]">0.00%</p>
              </div>
            </div>

            {summaryData.amount === 0 && (
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                No hay snapshots cargados. Subi un extracto BCI para registrar el saldo.
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="size-6 text-[#0033A0]" />
              <h2 className="text-lg font-semibold text-[#010103]">Cobertura</h2>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Supply wCLP</p>
                <p className="text-lg font-semibold text-[#010103]">
                  {summaryData.cobertura.supply != null
                    ? Math.round(summaryData.cobertura.supply).toLocaleString("es-CL")
                    : "\u2014"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Colateral</p>
                <p className="text-lg font-semibold text-[#010103]">{formatClp(summaryData.cobertura.colateral)}</p>
              </div>
              <div>
                <p className="text-xs text-[#010103]/60 uppercase tracking-wide">Ratio</p>
                <p className={`text-lg font-semibold ${ratioColor}`}>
                  {summaryData.cobertura.ratio != null ? `${summaryData.cobertura.ratio.toFixed(1)}%` : "\u2014"}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* BCI Upload section */}
      <section className="rounded-lg border border-[#010103]/10 bg-[#FFFFFF] overflow-hidden">
        <button
          type="button"
          onClick={() => setSectionOpen((o) => !o)}
          className="w-full flex flex-wrap items-center justify-between gap-4 p-6 text-left hover:bg-[#010103]/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="size-8 text-[#0033A0]" />
            <div>
              <h2 className="font-semibold text-lg text-[#010103]">Cargar Extracto BCI</h2>
              <p className="text-sm text-[#010103]/70">
                Subir XLSX extracto mensual BCI (MOVCTACTE) para actualizar saldo.
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
                Extracto BCI (XLSX)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExtractoFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[#010103]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#0033A0]/10 file:text-[#0033A0] hover:file:bg-[#0033A0]/20"
              />
              {extractoFile && (
                <p className="text-xs text-[#010103]/50 mt-1">{extractoFile.name}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleUpload}
                disabled={uploading || !extractoFile}
                className="bg-[#0033A0] hover:bg-[#002080] text-white"
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
                <div className="rounded-xl border border-[#010103]/10 p-4">
                  <h3 className="font-semibold text-[#010103] mb-3">Resumen del Extracto</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-[#010103]/60 text-xs">Periodo</p>
                      <p className="font-medium">
                        {formatDate(previewSnapshot.periodoInicio)} &rarr; {formatDate(previewSnapshot.periodoFin)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#010103]/60 text-xs">Saldo Final</p>
                      <p className="font-mono font-medium">{formatClp(previewSnapshot.saldoFinal)}</p>
                    </div>
                    <div>
                      <p className="text-[#010103]/60 text-xs">Total Abonos</p>
                      <p className="font-mono font-medium text-green-700">{formatClp(previewSnapshot.totalAbonos)}</p>
                    </div>
                    <div>
                      <p className="text-[#010103]/60 text-xs">Total Cargos</p>
                      <p className="font-mono font-medium text-red-600">{formatClp(previewSnapshot.totalCargos)}</p>
                    </div>
                  </div>

                  <div className="mt-3 p-2 bg-[#010103]/5 rounded text-xs text-[#010103]/60">
                    Cuenta corriente sin rendimiento. Se registra rendimiento 0%.
                  </div>
                </div>

                {/* Transactions table */}
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
                            <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Abono</th>
                            <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Cargo</th>
                            <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewTransactions.map((t, i) => (
                            <tr key={i} className="border-t border-[#010103]/5">
                              <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.fecha)}</td>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={t.descripcion}>
                                {t.descripcion}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-green-700">
                                {t.abono > 0 ? formatClp(t.abono) : ""}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-red-600">
                                {t.cargo > 0 ? formatClp(t.cargo) : ""}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">{formatClp(t.saldo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {previewTransactions.length === 0 && (
                  <p className="text-sm text-[#010103]/50">Sin movimientos en el periodo.</p>
                )}

                <Button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="bg-[#0033A0] hover:bg-[#002080] text-white"
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
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Total Abonos</th>
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Total Cargos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedSnapshots.map((s) => (
                        <tr key={s.id} className="border-t border-[#010103]/5">
                          <td className="px-3 py-2 font-medium">{formatDate(s.fechaCorte)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatClp(s.saldoFinal)}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-700">{formatClp(s.totalAbonos)}</td>
                          <td className="px-3 py-2 text-right font-mono text-red-600">{formatClp(s.totalCargos)}</td>
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
    </div>
  );
}
