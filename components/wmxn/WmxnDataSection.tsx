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

interface MxnPositionPreview {
  periodoInicio: string;
  periodoFin: string;
  fondo: string;
  serie: string;
  titulosInicio: number;
  titulosCierre: number;
  precioValuacion: number;
  valorCartera: number;
  movimientosNetos: number;
  plusvalia: number;
  rendimientoAnual: number;
  rendimientoMensual: number;
}

interface SavedMxnPosition {
  id: string;
  fechaReporte: string;
  fondo: string;
  serie: string;
  titulosCierre: number;
  precioValuacion: number;
  valorCartera: number;
  plusvalia: number;
  rendimientoAnual: number;
}

function formatMxn(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export function WmxnDataSection({ onConfirmed }: { onConfirmed?: () => void }): React.ReactElement {
  const [sectionOpen, setSectionOpen] = useState(false);

  // Upload state
  const [estadoCuentaFile, setEstadoCuentaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview state (after upload, before confirm)
  const [previewPosition, setPreviewPosition] = useState<MxnPositionPreview | null>(null);

  // Confirm state
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ success: boolean; message: string } | null>(null);

  // Saved positions
  const [savedPositions, setSavedPositions] = useState<SavedMxnPosition[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const fetchSavedPositions = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/wmxn/positions");
      const json = await res.json();
      if (json.success) {
        setSavedPositions(json.data);
      }
    } catch {
      // ignore
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sectionOpen && savedPositions.length === 0) {
      fetchSavedPositions();
    }
  }, [sectionOpen, savedPositions.length, fetchSavedPositions]);

  const handleUpload = async () => {
    if (!estadoCuentaFile) {
      setUploadError("Selecciona un archivo PDF.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setConfirmResult(null);
    try {
      const formData = new FormData();
      formData.append("estadoCuenta", estadoCuentaFile);

      const res = await fetch("/api/wmxn/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success) {
        setPreviewPosition(json.data.position);
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
    if (!previewPosition) return;
    setConfirming(true);
    setConfirmResult(null);
    try {
      const res = await fetch("/api/wmxn/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: previewPosition }),
      });
      const json = await res.json();
      if (json.success) {
        setConfirmResult({
          success: true,
          message: `Posicion guardada: ${previewPosition.fondo} serie ${previewPosition.serie} al ${formatDate(previewPosition.periodoFin)}.`,
        });
        setPreviewPosition(null);
        setEstadoCuentaFile(null);
        fetchSavedPositions();
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
          <FileText className="size-8 text-[#16a34a]" />
          <div>
            <h2 className="font-semibold text-lg text-[#010103]">wMXN - Fondos de Inversion</h2>
            <p className="text-sm text-[#010103]/70">
              Cargar PDF de Estado de Cuenta Fondos de Inversion (Banregio).
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
              Estado Cuenta Fondos de Inversion (PDF)
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setEstadoCuentaFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[#010103]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#16a34a]/10 file:text-[#16a34a] hover:file:bg-[#16a34a]/20"
            />
            {estadoCuentaFile && (
              <p className="text-xs text-[#010103]/50 mt-1">{estadoCuentaFile.name}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleUpload}
              disabled={uploading || !estadoCuentaFile}
              className="bg-[#16a34a] hover:bg-[#15803d] text-white"
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
          {previewPosition && (
            <div className="space-y-4">
              <h3 className="font-semibold text-[#010103]">
                Preview: {previewPosition.fondo} Serie {previewPosition.serie}
              </h3>

              <div className="overflow-x-auto border rounded-lg border-[#010103]/10">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Periodo</td>
                      <td className="px-3 py-2 text-[#010103]">
                        {formatDate(previewPosition.periodoInicio)} — {formatDate(previewPosition.periodoFin)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Fondo / Serie</td>
                      <td className="px-3 py-2 text-[#010103]">
                        {previewPosition.fondo} / {previewPosition.serie}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Titulos Inicio</td>
                      <td className="px-3 py-2 text-[#010103] font-mono">
                        {previewPosition.titulosInicio.toLocaleString("es-MX", { maximumFractionDigits: 6 })}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Titulos Cierre</td>
                      <td className="px-3 py-2 text-[#010103] font-mono">
                        {previewPosition.titulosCierre.toLocaleString("es-MX", { maximumFractionDigits: 6 })}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Precio Valuacion</td>
                      <td className="px-3 py-2 text-[#010103] font-mono">
                        {formatMxn(previewPosition.precioValuacion)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5 bg-emerald-50/50">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Valor Cartera</td>
                      <td className="px-3 py-2 text-[#010103] font-mono font-semibold">
                        {formatMxn(previewPosition.valorCartera)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Movimientos Netos</td>
                      <td className="px-3 py-2 text-[#010103] font-mono">
                        {formatMxn(previewPosition.movimientosNetos)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Plusvalia</td>
                      <td className={`px-3 py-2 font-mono font-medium ${previewPosition.plusvalia >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {formatMxn(previewPosition.plusvalia)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#010103]/5">
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Rendimiento Anual</td>
                      <td className="px-3 py-2 text-[#010103] font-mono">
                        {previewPosition.rendimientoAnual?.toFixed(2) ?? "—"}%
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-[#010103]/70">Rendimiento Mensual</td>
                      <td className="px-3 py-2 text-[#010103] font-mono">
                        {previewPosition.rendimientoMensual?.toFixed(4) ?? "—"}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <Button
                onClick={handleConfirm}
                disabled={confirming}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white"
              >
                {confirming ? (
                  <RefreshCw className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="size-4 mr-2" />
                )}
                Confirmar y guardar posicion
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

            {savedPositions.length === 0 && !savedLoading && (
              <p className="text-sm text-[#010103]/50">No hay posiciones guardadas aun.</p>
            )}

            {savedPositions.length > 0 && (
              <div className="border rounded-lg border-[#010103]/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#010103]/5">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-[#010103]/60">Fecha Reporte</th>
                        <th className="px-3 py-2 text-left font-medium text-[#010103]/60">Fondo</th>
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Titulos Cierre</th>
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Precio</th>
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Valor Cartera</th>
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Plusvalia</th>
                        <th className="px-3 py-2 text-right font-medium text-[#010103]/60">Rend. Anual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedPositions.map((p) => (
                        <tr key={p.id} className="border-t border-[#010103]/5">
                          <td className="px-3 py-2">{formatDate(p.fechaReporte)}</td>
                          <td className="px-3 py-2">{p.fondo}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {p.titulosCierre.toLocaleString("es-MX", { maximumFractionDigits: 6 })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{formatMxn(p.precioValuacion)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatMxn(p.valorCartera)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${p.plusvalia >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {formatMxn(p.plusvalia)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {p.rendimientoAnual?.toFixed(2) ?? "—"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
