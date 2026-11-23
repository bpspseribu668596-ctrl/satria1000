/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { db, type Request, type User } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { compressSignatureToDataUrl } from "../lib/signatureUtils";
import SignatureCanvas from "react-signature-canvas";
import {
  ListChecks,
  CheckSquare,
  Square,
  Search,
  PenTool,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  User as UserIcon,
  Eraser,
  FileText
} from "lucide-react";

export default function Verification() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [verifierName, setVerifierName] = useState("");
  const [verifierNIP, setVerifierNIP] = useState("");
  const [verifierDate, setVerifierDate] = useState(new Date().toISOString().split("T")[0]);
  const [verifierNotes, setVerifierNotes] = useState("");
  const [sigMode, setSigMode] = useState<"draw" | "upload" | "skip">("draw");
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);
  const sigCanvasRef = useRef<SignatureCanvas>(null);

  // Execution & Progress State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentDoc: "" });

  const loadData = async () => {
    try {
      const [reqs, usrs] = await Promise.all([
        db.requests.where("status").equals("pending_verification").toArray(),
        db.users.toArray(),
      ]);
      setRequests(reqs || []);
      setUsers(usrs || []);
    } catch (err) {
      console.error("Gagal memuat data verifikasi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getUserName = (id: number) =>
    users.find((u) => u.id === id)?.name || "Unknown";

  const filteredRequests = requests.filter((r) => {
    const q = searchTerm.toLowerCase();
    const doc = (r.document_number || "").toLowerCase();
    const name = getUserName(r.requester_id).toLowerCase();
    return doc.includes(q) || name.includes(q);
  });

  // Toggle selection
  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRequests.length && filteredRequests.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequests.map((r) => r.id!)));
    }
  };

  // Open batch modal
  const handleOpenBatchModal = () => {
    if (selectedIds.size === 0) return;
    setVerifierName(user?.name || "");
    setVerifierNIP(user?.nip || "");
    setVerifierDate(new Date().toISOString().split("T")[0]);
    setVerifierNotes("");
    setSigMode("draw");
    setUploadedSig(null);
    setShowBatchModal(true);
  };

  // Handle signature file upload
  const handleSigFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressSignatureToDataUrl(file);
      setUploadedSig(compressed);
    } catch (err) {
      console.error("Gagal membaca file tanda tangan:", err);
      alert("Gagal membaca file tanda tangan. Pastikan format gambar valid (PNG/JPG).");
    }
  };

  // Execute batch verification
  const handleExecuteBatchVerify = async () => {
    if (!verifierName.trim()) {
      alert("Mohon masukkan nama verifikator");
      return;
    }

    let finalSig: string | null = null;
    if (sigMode === "draw") {
      if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
        const raw = sigCanvasRef.current.toDataURL("image/png");
        finalSig = await compressSignatureToDataUrl(raw);
      }
    } else if (sigMode === "upload") {
      finalSig = uploadedSig;
    }

    const targetList = requests.filter((r) => selectedIds.has(r.id!));
    if (targetList.length === 0) return;

    const confirmMsg = `Verifikasi dan tanda tangani ${targetList.length} dokumen permintaan sekaligus?`;
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: targetList.length, currentDoc: "" });

    const notes = `${verifierName.trim()} (${verifierNIP.trim()})${verifierNotes.trim() ? " - " + verifierNotes.trim() : ""}`;
    const nowIso = new Date().toISOString();

    let successCount = 0;
    for (let i = 0; i < targetList.length; i++) {
      const req = targetList[i];
      setProgress({
        current: i + 1,
        total: targetList.length,
        currentDoc: req.document_number || `ID ${req.id}`,
      });

      try {
        await db.requests.update(req.id!, {
          status: "verified",
          verifier_id: user?.id || 1,
          verification_date: verifierDate || nowIso.split("T")[0],
          verifier_signature: finalSig || req.verifier_signature || null,
          verification_notes: notes,
          updated_at: nowIso,
        });
        successCount++;
      } catch (err) {
        console.error(`Gagal verifikasi dokumen ${req.document_number}:`, err);
      }

      // Small throttle to ensure reliable network / WAF throughput
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    setIsProcessing(false);
    setShowBatchModal(false);
    setSelectedIds(new Set());
    alert(`Berhasil memverifikasi ${successCount} dari ${targetList.length} dokumen!`);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const isAllSelected =
    filteredRequests.length > 0 && selectedIds.size === filteredRequests.length;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Verifikasi Permintaan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Daftar pengajuan formulir ATK yang menunggu proses verifikasi
          </p>
        </div>

        {/* Action Button */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleOpenBatchModal}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all cursor-pointer animate-fade-in"
          >
            <PenTool size={18} />
            <span>Verifikasi & TTD Sekaligus ({selectedIds.size})</span>
          </button>
        )}
      </div>

      {/* Filter & Toolbar Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Cari nomor dokumen atau nama pemohon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-sm">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition cursor-pointer"
          >
            {isAllSelected ? (
              <CheckSquare size={16} className="text-blue-600" />
            ) : (
              <Square size={16} className="text-slate-400" />
            )}
            <span>{isAllSelected ? "Batalkan Semua" : "Pilih Semua"}</span>
          </button>

          {selectedIds.size > 0 && (
            <span className="text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-lg">
              {selectedIds.size} dipilih
            </span>
          )}
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {filteredRequests.length === 0 ? (
          <div className="py-16 text-center">
            <ListChecks size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">
              {searchTerm
                ? "Tidak ada permintaan yang cocok dengan pencarian"
                : "Tidak ada permintaan yang perlu diverifikasi"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((req) => {
              const isSelected = selectedIds.has(req.id!);
              return (
                <div
                  key={req.id}
                  className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                    isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  {/* Row Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleSelectOne(req.id!)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 cursor-pointer focus:outline-none"
                  >
                    {isSelected ? (
                      <CheckSquare size={20} className="text-blue-600" />
                    ) : (
                      <Square size={20} className="text-slate-300" />
                    )}
                  </button>

                  {/* Main Content Link */}
                  <Link
                    to={`/app/request/${req.id}`}
                    className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 hover:text-blue-600 transition-colors">
                        {req.document_number}
                      </div>
                      <div className="text-xs sm:text-sm text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-slate-700">
                          {getUserName(req.requester_id)}
                        </span>
                        <span>•</span>
                        <span>{req.items?.length || 0} jenis barang</span>
                        <span>•</span>
                        <span className="text-purple-700 font-medium">
                          Buku:{" "}
                          {new Date(
                            req.book_date || req.submission_date
                          ).toLocaleDateString("id-ID")}
                        </span>
                        <span>•</span>
                        <span>
                          Dok:{" "}
                          {new Date(
                            req.document_date || req.submission_date
                          ).toLocaleDateString("id-ID")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {req.requester_signature ? (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          ✓ TTD Pemohon
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          Belum TTD
                        </span>
                      )}
                      <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold whitespace-nowrap">
                        Perlu Verifikasi
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Action Bar on Mobile/Tablet */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700">
          <span className="text-sm font-medium">
            <b className="text-blue-400">{selectedIds.size}</b> dokumen terpilih
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleOpenBatchModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition cursor-pointer shadow-md shadow-blue-500/20"
          >
            <PenTool size={16} />
            <span>Verifikasi Sekaligus</span>
          </button>
        </div>
      )}

      {/* BATCH VERIFICATION MODAL */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">
                  Verifikasi & TTD Massal
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Memverifikasi {selectedIds.size} dokumen terpilih sekaligus
                </p>
              </div>
              {!isProcessing && (
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Document Summary Pill */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 flex items-center gap-3">
                <FileText size={20} className="text-blue-600 shrink-0" />
                <div className="text-xs text-blue-900 leading-relaxed">
                  Tanda tangan dan identitas verifikator ini akan disematkan ke{" "}
                  <b>{selectedIds.size} dokumen</b> secara serentak. Status seluruh
                  dokumen akan berubah menjadi <b>Terverifikasi</b>.
                </div>
              </div>

              {/* Form Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Verifikator <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={verifierName}
                      onChange={(e) => setVerifierName(e.target.value)}
                      disabled={isProcessing}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      placeholder="Nama lengkap & gelar"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIP Verifikator
                  </label>
                  <input
                    type="text"
                    value={verifierNIP}
                    onChange={(e) => setVerifierNIP(e.target.value)}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    placeholder="NIP verifikator"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Verifikasi
                  </label>
                  <div className="relative">
                    <Calendar
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="date"
                      value={verifierDate}
                      onChange={(e) => setVerifierDate(e.target.value)}
                      disabled={isProcessing}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Verifikasi (Opsional)
                  </label>
                  <input
                    type="text"
                    value={verifierNotes}
                    onChange={(e) => setVerifierNotes(e.target.value)}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    placeholder="Contoh: Dokumen lengkap & sesuai"
                  />
                </div>
              </div>

              {/* Signature Section */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Tanda Tangan Digital Verifikator
                </label>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 gap-4 mb-3">
                  <button
                    type="button"
                    onClick={() => setSigMode("draw")}
                    disabled={isProcessing}
                    className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
                      sigMode === "draw"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <PenTool size={14} />
                    <span>Gambar TTD</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigMode("upload")}
                    disabled={isProcessing}
                    className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
                      sigMode === "upload"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <Upload size={14} />
                    <span>Upload Gambar PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigMode("skip")}
                    disabled={isProcessing}
                    className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
                      sigMode === "skip"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <span>Tanpa TTD (Nanti)</span>
                  </button>
                </div>

                {/* Tab 1: Draw */}
                {sigMode === "draw" && (
                  <div className="space-y-2">
                    <div className="border border-slate-300 rounded-xl overflow-hidden bg-slate-50 relative">
                      <SignatureCanvas
                        ref={sigCanvasRef}
                        penColor="#0f172a"
                        canvasProps={{
                          className: "w-full h-36 bg-transparent cursor-crosshair",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => sigCanvasRef.current?.clear()}
                        disabled={isProcessing}
                        className="absolute bottom-2 right-2 text-xs bg-white/90 hover:bg-white text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1 cursor-pointer"
                      >
                        <Eraser size={12} />
                        <span>Hapus</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 italic">
                      * Gambar tanda tangan menggunakan mouse, touchpad, atau layar sentuh.
                    </p>
                  </div>
                )}

                {/* Tab 2: Upload */}
                {sigMode === "upload" && (
                  <div className="space-y-3">
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-400 transition bg-slate-50">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleSigFileUpload}
                        disabled={isProcessing}
                        className="hidden"
                        id="batch-verifier-sig-upload"
                      />
                      <label
                        htmlFor="batch-verifier-sig-upload"
                        className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                      >
                        <Upload size={24} className="text-blue-500" />
                        <span className="text-xs font-semibold text-blue-600">
                          Klik untuk memilih file tanda tangan
                        </span>
                        <span className="text-[11px] text-slate-400">
                          PNG transparan atau foto tanda tangan kertas (latar putih akan otomatis dibersihkan)
                        </span>
                      </label>
                    </div>

                    {uploadedSig && (
                      <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="flex items-center gap-3">
                          <img
                            src={uploadedSig}
                            alt="Preview TTD"
                            className="h-10 max-w-[120px] object-contain border border-emerald-300 rounded bg-white p-1"
                          />
                          <span className="text-xs text-emerald-800 font-medium">
                            ✓ Tanda tangan siap digunakan (Transparan)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUploadedSig(null)}
                          className="text-xs text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Skip */}
                {sigMode === "skip" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    <span>
                      Dokumen akan diverifikasi dengan identitas nama & NIP verifikator, tetapi tanda tangan digital dikosongkan (bisa ditambahkan nanti per dokumen).
                    </span>
                  </div>
                )}
              </div>

              {/* Progress State */}
              {isProcessing && (
                <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-blue-400" />
                      <span>Memproses dokumen...</span>
                    </span>
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-200"
                      style={{
                        width: `${Math.round(
                          (progress.current / progress.total) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Menyimpan: {progress.currentDoc}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-sm font-medium transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBatchVerify}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition cursor-pointer disabled:opacity-50 shadow-md shadow-blue-500/20"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Verifikasi {selectedIds.size} Dokumen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
