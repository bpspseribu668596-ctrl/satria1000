import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db, type Request, type Settings, type User } from "../lib/db";
import { CheckCircle2, ShieldCheck, FileText, ArrowRight, ExternalLink } from "lucide-react";
import QRCodeImage from "../components/QRCodeImage";

export default function PublicVerifyRequest() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<Request | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [req, sett, usrs] = await Promise.all([
        db.requests.get(parseInt(id)),
        db.settings.get(1),
        db.users.toArray(),
      ]);

      if (!req) {
        setError("Dokumen permintaan ATK tidak ditemukan dalam sistem.");
      } else {
        setRequest(req);
      }
      setSettings(sett || null);
      setUsers(usrs || []);
    } catch (err) {
      setError("Gagal memuat data verifikasi dokumen: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const currentUrl = window.location.href;

  const requester = request ? users.find((u) => u.id === request.requester_id) : null;
  const verifier = request?.verifier_id ? users.find((u) => u.id === request.verifier_id) : null;
  const supervisor = request?.supervisor_id ? users.find((u) => u.id === request.supervisor_id) : null;

  // Extract from notes if available
  const getParsedName = (notes?: string | null, fallbackUser?: User | null) => {
    if (notes) {
      const match = notes.match(/^(.+?) \((.+?)\)/);
      if (match) return { name: match[1], nip: match[2] };
    }
    return fallbackUser ? { name: fallbackUser.name, nip: fallbackUser.nip } : null;
  };

  const verifierInfo = getParsedName(request?.verification_notes, verifier);
  const approverInfo = getParsedName(request?.approval_notes, supervisor);

  const formatIndoDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-200">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800">Memverifikasi Dokumen...</h2>
          <p className="text-xs text-slate-500 mt-1">Menghubungkan ke basis data SATRIA BPS Kota Jakarta Selatan</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-red-200">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Dokumen Tidak Ditemukan</h2>
          <p className="text-sm text-slate-600 mt-2">{error || "Data dokumen tidak valid."}</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Masuk ke Aplikasi SATRIA <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-100 py-8 px-4 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Branding */}
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo BPS" className="h-10 w-10 object-contain" />
            ) : (
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                BPS
              </div>
            )}
            <div>
              <h1 className="font-extrabold text-sm uppercase tracking-wide text-slate-900">
                {settings?.org_name || "BPS Kota Jakarta Selatan"}
              </h1>
              <p className="text-xs text-blue-600 font-semibold">
                Sistem Informasi Pengelolaan ATK (SATRIA)
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <ShieldCheck size={14} /> Otentikasi Sah
          </span>
        </div>

        {/* Verification Certificate Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Certificate Banner */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl mb-3 shadow-inner">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              DOKUMEN RESMI TERVERIFIKASI
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100 mt-1 max-w-md mx-auto">
              Keaslian Formulir Permintaan ATK ini sah dan terdaftar resmi pada Sistem Basis Data SATRIA
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Document Meta Information */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Nomor Dokumen
                  </span>
                  <div className="text-base sm:text-lg font-mono font-black text-slate-900">
                    {request.document_number}
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Status Dokumen
                  </span>
                  <div>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        request.status === "approved"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : request.status === "verified"
                          ? "bg-blue-100 text-blue-800 border border-blue-200"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {request.status === "approved" ? "Disetujui (Approved)" : request.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Tanggal Pengajuan</span>
                  <span className="font-bold text-slate-800">{formatIndoDate(request.submission_date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Tgl Buku SAKTI</span>
                  <span className="font-bold text-purple-700 font-mono">
                    {formatIndoDate(request.book_date || request.document_date)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Lokasi</span>
                  <span className="font-bold text-slate-800">{request.submission_location || "Jakarta Selatan"}</span>
                </div>
              </div>
            </div>

            {/* Signatories Verification Section */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                Identitas Penandatangan Resmi
              </h3>
              <div className="grid sm:grid-cols-3 gap-3">
                {/* 1. Pemohon */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide block">
                    1. Pemohon
                  </span>
                  <div className="font-bold text-slate-800 text-sm truncate">
                    {requester?.name || "Pegawai"}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {requester?.nip ? `NIP. ${requester.nip}` : "-"}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {request.fungsi_bagian || "Unit Kerja"}
                  </div>
                </div>

                {/* 2. Verifikator */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide block">
                    2. Verifikator
                  </span>
                  <div className="font-bold text-slate-800 text-sm truncate">
                    {verifierInfo?.name || verifier?.name || "-"}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {verifierInfo?.nip || verifier?.nip ? `NIP. ${verifierInfo?.nip || verifier?.nip}` : "-"}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    Pengelola Barang Persediaan
                  </div>
                </div>

                {/* 3. Menyetujui */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wide block">
                    3. Menyetujui
                  </span>
                  <div className="font-bold text-slate-800 text-sm truncate">
                    {approverInfo?.name || supervisor?.name || settings?.official_name || "-"}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {approverInfo?.nip || supervisor?.nip || settings?.official_nip
                      ? `NIP. ${approverInfo?.nip || supervisor?.nip || settings?.official_nip}`
                      : "-"}
                  </div>
                  <div className="text-[10px] text-purple-700 font-bold">
                    {settings?.official_job && settings.official_job !== "Pejabat Pembuat Komitmen"
                      ? settings.official_job
                      : "Kepala Subbagian Umum"}
                  </div>
                </div>
              </div>
            </div>

            {/* List of Requested Items */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                <span>Daftar Barang Disetujui</span>
                <span className="font-normal text-slate-400">{request.items?.length || 0} Barang</span>
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3">Nama Barang</th>
                      <th className="py-2.5 px-3 text-right w-24">Jumlah</th>
                      <th className="py-2.5 px-3 text-left w-20">Satuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(request.items || []).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{item.name}</td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">{item.quantity}</td>
                        <td className="py-2 px-3 text-slate-500 uppercase font-bold text-[11px]">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* QR Code and Direct URL Footer */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-2xl">
              <div className="shrink-0 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
                <QRCodeImage text={currentUrl} size={90} />
              </div>
              <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-800">
                  Tautan Verifikasi Keaslian Sistem SATRIA
                </div>
                <div className="text-[11px] font-mono text-blue-600 break-all select-all font-semibold">
                  {currentUrl}
                </div>
                <p className="text-[10px] text-slate-500">
                  Pindai QR Code di atas menggunakan kamera smartphone untuk memverifikasi dokumen ini kapan saja secara mandiri.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-slate-400 font-medium">
                Sistem SATRIA &bull; Badan Pusat Statistik
              </span>
              <Link
                to={`/app/request/${request.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-200 transition-all active:scale-95"
              >
                Buka di Aplikasi SATRIA <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
