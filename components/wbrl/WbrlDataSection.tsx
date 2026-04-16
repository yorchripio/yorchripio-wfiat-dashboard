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

interface CdbPositionPreview {
  fechaPosicao: string;
  fechaInicio: string;
  fechaVencimento: string;
  producto: string;
  emisor: string;
  capitalInicial: number;
  valorBruto: number;
  valorBloqueado: number;
  valorLiquido: number;
  iof: number;
  ir: number;
  indexador: string;
  pctIndexador: number;
  esColateral: boolean;
}

interface ExtratoMovimiento {
  fecha: string;
  descripcion: string;
  valor: number;
}

interface SavedPosition {
  id: string;
  fechaPosicao: string;
  fechaInicio: string;
  fechaVencimento: string;
  capitalInicial: number;
  valorBruto: number;
  valorLiquido: number;
  ir: number;
  indexador: string;
  pctIndexador: number;
  emisor: string;
  esColateral: boolean;
}

interface PositionGroup {
  fecha: string;
  colateral: {
    count: number;
    capitalInicial: number;
    valorBruto: number;
    valorLiquido: number;
    ir: number;
  };
  noColateral: {
    count: number;
    capitalInicial: number;
    valorBruto: number;
    valorLiquido: number;
    ir: number;
  };
  positions: SavedPosition[];
}

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

async function parseJsonSafe(res: Response): Promise<{
  json: Record<string, unknown> | null;
  contentType: string;
}> {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const text = await res.text();
  if (!text) {
    return { json: null, contentType };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return { json: parsed as Record<string, unknown>, contentType };
    }
  } catch {
    // fallback handled by caller
  }
  return { json: null, contentType };
}

export function WbrlDataSection({ onConfirmed }: { onConfirmed?: () => void }): React.ReactElement {
  const [sectionOpen, setSectionOpen] = useState(false);

  // Upload state
  const [rendaFixaFile, setRendaFixaFile] = useState<File | null>(null);
  const [extratoFile, setExtratoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview state (after upload, before confirm)
  const [previewPositions, setPreviewPositions] = useState<CdbPositionPreview[] | null>(null);
  const [previewMovimientos, setPreviewMovimientos] = useState<ExtratoMovimiento[]>([]);

  // Confirm state
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ success: boolean; message: string } | null>(null);

  // Balance import state
  const [balanceFile, setBalanceFile] = useState<File | null>(null);
  const [balanceUploading, setBalanceUploading] = useState(false);
  const [balanceResult, setBalanceResult] = useState<{ success: boolean; message: string } | null>(null);

  // Saved positions
  const [savedGroups, setSavedGroups] = useState<PositionGroup[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const fetchSavedPositions = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/wbrl/positions");
      const json = await res.json();
      if (json.success) {
        setSavedGroups(json.data);
      }
    } catch {
      // ignore
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sectionOpen && savedGroups.length === 0) {
      fetchSavedPositions();
    }
  }, [sectionOpen, savedGroups.length, fetchSavedPositions]);

  const handleUpload = async () => {
    if (!rendaFixaFile && !extratoFile) {
      setUploadError("Seleccioná al menos un archivo.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setConfirmResult(null);
    try {
      const formData = new FormData();
      if (rendaFixaFile) formData.append("rendaFixa", rendaFixaFile);
      if (extratoFile) formData.append("extrato", extratoFile);

      const res = await fetch("/api/wbrl/upload", { method: "POST", body: formData });
      const { json, contentType } = await parseJsonSafe(res);

      if (!json) {
        if (contentType.includes("text/html")) {
          setUploadError(
            "El servidor devolvió HTML en vez de JSON. Suele ser un error interno o archivo demasiado grande para Vercel."
          );
        } else {
          setUploadError(`Respuesta inválida del servidor (HTTP ${res.status}).`);
        }
        return;
      }

      if (json.success) {
        const data = (json.data ?? {}) as {
          positions?: CdbPositionPreview[];
          movimientos?: ExtratoMovimiento[];
        };
        setPreviewPositions(data.positions ?? []);
        setPreviewMovimientos(data.movimientos ?? []);
      } else {
        const errorMsg = typeof json.error === "string" ? json.error : "Error procesando archivos";
        setUploadError(errorMsg);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setUploading(false);
    }
  };

  const toggleColateral = (idx: number) => {
    if (!previewPositions) return;
    const updated = [...previewPositions];
    updated[idx] = { ...updated[idx], esColateral: !updated[idx].esColateral };
    setPreviewPositions(updated);
  };

  const handleConfirm = async () => {
    if (!previewPositions) return;
    setConfirming(true);
    setConfirmResult(null);
    try {
      const res = await fetch("/api/wbrl/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions: previewPositions,
          movimientos: previewMovimientos,
        }),
      });
      const { json } = await parseJsonSafe(res);
      if (json?.success) {
        const data = (json.data ?? {}) as {
          positionsCreated?: number;
          colateral?: number;
          noColateral?: number;
        };
        setConfirmResult({
          success: true,
          message: `Guardadas ${data.positionsCreated ?? 0} posiciones (${data.colateral ?? 0} colateral, ${data.noColateral ?? 0} no-colateral).`,
        });
        setPreviewPositions(null);
        setPreviewMovimientos([]);
        setRendaFixaFile(null);
        setExtratoFile(null);
        fetchSavedPositions();
        onConfirmed?.();
      } else {
        const errorMsg =
          json && typeof json.error === "string"
            ? json.error
            : `Error guardando (HTTP ${res.status})`;
        setConfirmResult({ success: false, message: errorMsg });
      }
    } catch (err) {
      setConfirmResult({ success: false, message: err instanceof Error ? err.message : "Error" });
    } finally {
      setConfirming(false);
    }
  };

  const handleBalanceImport = async () => {
    if (!balanceFile) return;
    setBalanceUploading(true);
    setBalanceResult(null);
    try {
      const formData = new FormData();
      formData.append("file", balanceFile);
      const res = await fetch("/api/wbrl/import-balance", { method: "POST", body: formData });
      const { json } = await parseJsonSafe(res);
      if (json?.success) {
        const data = (json.data ?? {}) as {
          totalRows?: number;
          created?: number;
          updated?: number;
          dateRange?: { from?: string; to?: string };
          latestCirculante?: number;
        };
        setBalanceResult({
          success: true,
          message: `Importados ${data.totalRows ?? 0} snapshots (${data.created ?? 0} nuevos, ${data.updated ?? 0} actualizados). Rango: ${data.dateRange?.from ?? "-"} a ${data.dateRange?.to ?? "-"}. Circulante actual: R$ ${data.latestCirculante?.toLocaleString("pt-BR") ?? "0"}`,
        });
        setBalanceFile(null);
      } else {
        const errorMsg =
          json && typeof json.error === "string"
            ? json.error
            : `Error importando (HTTP ${res.status})`;
        setBalanceResult({ success: false, message: errorMsg });
      }
    } catch (err) {
      setBalanceResult({ success: false, message: err instanceof Error ? err.message : "Error" });
    } finally {
      setBalanceUploading(false);
    }
  };

  const colateralPositions = previewPositions?.filter((p) => p.esColateral) ?? [];
  const noColateralPositions = previewPositions?.filter((p) => !p.esColateral) ?? [];
  const totalColateralBruto = colateralPositions.reduce((s, p) => s + p.valorBruto, 0);
  const totalColateralCapital = colateralPositions.reduce((s, p) => s + p.capitalInicial, 0);

  return (
    <section className="rounded-lg border border-[#010103]/10 bg-[#FFFFFF] overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionOpen((o) => !o)}
        className="w-full flex flex-wrap items-center justify-between gap-4 p-6 text-left hover:bg-[#010103]/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="size-8 text-[#16a34a]" />
          <div>
            <h2 className="font-semibold text-lg text-[#010103]">wBRL - Renda Fixa</h2>
            <p className="text-sm text-[#010103]/70">
              Cargar PDF de Posição Renda Fixa y/o XLSX de Extrato de Conta Corrente (Banco Genial).
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#010103] mb-1">
                Posição Renda Fixa (PDF)
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setRendaFixaFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[#010103]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#16a34a]/10 file:text-[#16a34a] hover:file:bg-[#16a34a]/20"
              />
              {rendaFixaFile && (
                <p className="text-xs text-[#010103]/50 mt-1">{rendaFixaFile.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#010103] mb-1">
                Extrato de Conta Corrente (XLSX)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExtratoFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[#010103]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#16a34a]/10 file:text-[#16a34a] hover:file:bg-[#16a34a]/20"
              />
              {extratoFile && (
                <p className="text-xs text-[#010103]/50 mt-1">{extratoFile.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleUpload}
              disabled={uploading || (!rendaFixaFile && !extratoFile)}
              className="bg-[#16a34a] hover:bg-[#15803d] text-white"
            >
              {uploading ? (
                <RefreshCw className="size-4 animate-spin mr-2" />
              ) : (
                <Upload className="size-4 mr-2" />
              )}
              Procesar archivos
            </Button>
            {uploadError && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="size-4" /> {uploadError}
              </span>
            )}
          </div>

          {/* Balance XLSX import */}
          <div className="border-t border-[#010103]/10 pt-4">
            <h3 className="font-semibold text-[#010103] mb-2">Importar Balance wBRL (Circulante + Collateral)</h3>
            <p className="text-xs text-[#010103]/50 mb-2">
              Sube el Excel &quot;wBRL Collateral Balance&quot; para importar el historial de circulante y cobertura.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setBalanceFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-[#010103]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <Button
                onClick={handleBalanceImport}
                disabled={balanceUploading || !balanceFile}
                variant="outline"
                size="sm"
              >
                {balanceUploading ? (
                  <RefreshCw className="size-4 animate-spin mr-2" />
                ) : (
                  <Upload className="size-4 mr-2" />
                )}
                Importar Balance
              </Button>
            </div>
            {balanceResult && (
              <div
                className={`mt-2 p-3 rounded-lg text-sm flex items-center gap-2 ${
                  balanceResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                }`}
              >
                {balanceResult.success ? <CheckCircle className="size-4" /> : <AlertCircle className="size-4" />}
                {balanceResult.message}
              </div>
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

          {/* Preview table */}
          {previewPositions && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#010103]">
                  Preview: {previewPositions.length} posiciones CDB
                </h3>
                <div className="text-sm text-[#010103]/70">
                  <span className="text-[#16a34a] font-medium">{colateralPositions.length} colateral</span>
                  {" · "}
                  <span className="text-[#010103]/50">{noColateralPositions.length} no-colateral</span>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg border-[#010103]/10">
                <table className="w-full text-sm">
                  <thead className="bg-[#010103]/5">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Colateral</th>
                      <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Inicio</th>
                      <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Vencimiento</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Capital</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Bruto</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Liquido</th>
                      <th className="px-3 py-2 text-right font-medium text-[#010103]/70">IR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPositions.map((p, i) => (
                      <tr
                        key={i}
                        className={`border-t border-[#010103]/5 ${
                          p.esColateral ? "bg-green-50/50" : "bg-[#010103]/[0.02]"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={p.esColateral}
                            onChange={() => toggleColateral(i)}
                            className="rounded border-[#010103]/30"
                          />
                        </td>
                        <td className="px-3 py-2 text-[#010103]">{formatDate(p.fechaInicio)}</td>
                        <td className="px-3 py-2 text-[#010103]">{formatDate(p.fechaVencimento)}</td>
                        <td className="px-3 py-2 text-right text-[#010103] font-mono">{formatBrl(p.capitalInicial)}</td>
                        <td className="px-3 py-2 text-right text-[#010103] font-mono">{formatBrl(p.valorBruto)}</td>
                        <td className="px-3 py-2 text-right text-[#010103] font-mono">{formatBrl(p.valorLiquido)}</td>
                        <td className="px-3 py-2 text-right text-red-600 font-mono">{formatBrl(p.ir)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#010103]/5 font-semibold">
                    <tr>
                      <td className="px-3 py-2" colSpan={3}>
                        Total Colateral
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatBrl(totalColateralCapital)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatBrl(totalColateralBruto)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatBrl(colateralPositions.reduce((s, p) => s + p.valorLiquido, 0))}
                      </td>
                      <td className="px-3 py-2 text-right text-red-600 font-mono">
                        {formatBrl(colateralPositions.reduce((s, p) => s + p.ir, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {previewMovimientos.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-[#010103]/70 hover:text-[#010103]">
                    {previewMovimientos.length} movimientos del extracto
                  </summary>
                  <div className="mt-2 overflow-x-auto border rounded-lg border-[#010103]/10">
                    <table className="w-full text-sm">
                      <thead className="bg-[#010103]/5">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Fecha</th>
                          <th className="px-3 py-2 text-left font-medium text-[#010103]/70">Descripcion</th>
                          <th className="px-3 py-2 text-right font-medium text-[#010103]/70">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewMovimientos.map((m, i) => (
                          <tr key={i} className="border-t border-[#010103]/5">
                            <td className="px-3 py-2">{formatDate(m.fecha)}</td>
                            <td className="px-3 py-2">{m.descripcion}</td>
                            <td className={`px-3 py-2 text-right font-mono ${m.valor < 0 ? "text-red-600" : "text-green-700"}`}>
                              {formatBrl(m.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <Button
                onClick={handleConfirm}
                disabled={confirming || colateralPositions.length === 0}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white"
              >
                {confirming ? (
                  <RefreshCw className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="size-4 mr-2" />
                )}
                Confirmar y guardar ({colateralPositions.length} colateral + {noColateralPositions.length} no-colateral)
              </Button>
            </div>
          )}

          {/* Saved positions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[#010103]">Posiciones guardadas</h3>
              <Button variant="outline" size="sm" onClick={fetchSavedPositions} disabled={savedLoading}>
                <RefreshCw className={`size-4 mr-1 ${savedLoading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </div>

            {savedGroups.length === 0 && !savedLoading && (
              <p className="text-sm text-[#010103]/50">No hay posiciones guardadas aún.</p>
            )}

            {savedGroups.map((group) => (
              <div key={group.fecha} className="mb-4 border rounded-lg border-[#010103]/10 overflow-hidden">
                <div className="bg-[#010103]/5 p-3 flex items-center justify-between">
                  <span className="font-medium text-[#010103]">
                    Reporte: {formatDate(group.fecha)}
                  </span>
                  <div className="text-sm text-[#010103]/70 space-x-4">
                    <span>
                      Colateral: <strong className="text-[#16a34a]">{formatBrl(group.colateral.valorBruto)}</strong>
                      {" "}({group.colateral.count} pos.)
                    </span>
                    {group.noColateral.count > 0 && (
                      <span>
                        No-col: {formatBrl(group.noColateral.valorBruto)} ({group.noColateral.count} pos.)
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#010103]/[0.03]">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium text-[#010103]/60">Col.</th>
                        <th className="px-3 py-1.5 text-left font-medium text-[#010103]/60">Inicio</th>
                        <th className="px-3 py-1.5 text-left font-medium text-[#010103]/60">Venc.</th>
                        <th className="px-3 py-1.5 text-right font-medium text-[#010103]/60">Capital</th>
                        <th className="px-3 py-1.5 text-right font-medium text-[#010103]/60">Bruto</th>
                        <th className="px-3 py-1.5 text-right font-medium text-[#010103]/60">Liquido</th>
                        <th className="px-3 py-1.5 text-right font-medium text-[#010103]/60">IR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.positions.map((p) => (
                        <tr
                          key={p.id}
                          className={`border-t border-[#010103]/5 ${
                            p.esColateral ? "" : "opacity-50"
                          }`}
                        >
                          <td className="px-3 py-1.5">
                            {p.esColateral ? (
                              <span className="text-[#16a34a]" title="Colateral wBRL">&#x2713;</span>
                            ) : (
                              <span className="text-[#010103]/30" title="No colateral">&mdash;</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">{formatDate(p.fechaInicio)}</td>
                          <td className="px-3 py-1.5">{formatDate(p.fechaVencimento)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatBrl(p.capitalInicial)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatBrl(p.valorBruto)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatBrl(p.valorLiquido)}</td>
                          <td className="px-3 py-1.5 text-right text-red-600 font-mono">{formatBrl(p.ir)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
