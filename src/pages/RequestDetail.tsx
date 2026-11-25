import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { db, type Request, type User, type Settings, type RequestItem, type ATKItem } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import { WORK_UNIT_OPTIONS } from "../lib/workUnits";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Edit,
  MessageSquare,
  Printer,
  Plus,
  Search,
  X,
  Trash2,
  Save,
  Database,
  PenTool,
  Upload,
  Sparkles,
  Check,
} from "lucide-react";
import QRCodeImage from "../components/QRCodeImage";

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { dialogState, closeDialog, alert, confirm: confirmDialog, prompt } = useDialog();
  const verifierSigRef = useRef<SignatureCanvas>(null);
  const supervisorSigRef = useRef<SignatureCanvas>(null);
  const requesterSigRef = useRef<SignatureCanvas>(null);

  const [request, setRequest] = useState<Request | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRequesterSigModal, setShowRequesterSigModal] = useState(false);
  const [editRequesterSignature, setEditRequesterSignature] = useState<string | null>(null);

  // Bank Tanda Tangan Pegawai
  const [signatureBank, setSignatureBank] = useState<Array<{
    userId: number;
    name: string;
    nip: string;
    signature: string;
    workUnit?: string;
    sourceRole?: string;
  }>>([]);
  const [activeSigTab, setActiveSigTab] = useState<"bank" | "canvas" | "upload">("bank");
  const [sigSearchQuery, setSigSearchQuery] = useState("");
  const [saveToUserBank, setSaveToUserBank] = useState(true);

  // Form states for modals
  const [verifierName, setVerifierName] = useState("");
  const [verifierNIP, setVerifierNIP] = useState("");
  const [verifierNotes, setVerifierNotes] = useState("");
  const [approverName, setApproverName] = useState("");
  const [approverNIP, setApproverNIP] = useState("");
  const [approverNotes, setApproverNotes] = useState("");
  const [editedItems, setEditedItems] = useState<RequestItem[]>([]);
  const [itemsWithStock, setItemsWithStock] = useState<(ATKItem & { stock: number })[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");

  // Editable header fields (for Verifikator, Penanggung Jawab, Admin)
  const [editRequesterId, setEditRequesterId] = useState<number>(0);
  const [editFungsiBagian, setEditFungsiBagian] = useState<string>("");
  const [editDocumentDate, setEditDocumentDate] = useState<string>("");
  const [editBookDate, setEditBookDate] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");

  // Editable document number segments (only month is editable)
  const [docNumberPrefix, setDocNumberPrefix] = useState<string>("");
  const [docNumberMonth, setDocNumberMonth] = useState<string>("");
  const [docNumberSuffix, setDocNumberSuffix] = useState<string>("");

  const effectiveDocNumber = docNumberPrefix
    ? `${docNumberPrefix}${docNumberMonth}${docNumberSuffix}`
    : (docNumberMonth || request?.document_number || "");

  async function loadData() {
    const [req, usrs, sett] = await Promise.all([
      db.requests.get(Number(id)),
      db.users.toArray(),
      db.settings.get(1),
    ]);
    setRequest(req || null);
    setUsers(usrs);
    setSettings(sett || null);
    if (req) {
      setEditedItems(JSON.parse(JSON.stringify(req.items)));
      setEditRequesterId(req.requester_id);
      const reqUser = usrs.find((u: User) => u.id === req.requester_id);
      setEditFungsiBagian(req.fungsi_bagian || reqUser?.work_unit || "");
      setEditDocumentDate(req.document_date || req.submission_date || new Date().toISOString().split("T")[0]);
      setEditBookDate(req.book_date || req.submission_date || new Date().toISOString().split("T")[0]);
      setEditLocation(req.submission_location || "Kepulauan Seribu");
      setEditRequesterSignature(req.requester_signature || null);

      // Parse document_number e.g. "0013/ATK/5/2026"
      const docNum = req.document_number || "";
      const match = docNum.match(/^(.*\/)([^\/]+)(\/[^\/]+)$/);
      if (match) {
        setDocNumberPrefix(match[1]); // e.g. "0013/ATK/"
        setDocNumberMonth(match[2]);  // e.g. "5"
        setDocNumberSuffix(match[3]);  // e.g. "/2026"
      } else {
        setDocNumberPrefix("");
        setDocNumberMonth(docNum);
        setDocNumberSuffix("");
      }
    }

    // Load master items and stock for the selector + all historical requests for signature harvesting + transfer items
    const [masterItems, pItems, requests, rItems, requestsNew, initialBalances, allHistoricalRequests, tMasukItems, tKeluarItems] = await Promise.all([
      db.atk_items.toArray(),
      db.purchase_items.toArray(),
      db.atk_requests.where("status").equals("approved").toArray(),
      db.atk_request_items.toArray(),
      db.requests.where("status").equals("approved").toArray(),
      db.initial_balances.where("year").equals(new Date().getFullYear()).toArray(),
      db.requests.toArray(),
      db.transfer_masuk_items.toArray(),
      db.transfer_keluar_items.toArray(),
    ]);

    // Build Signature Bank from users and historical requests
    const sigMap = new Map<string, {
      userId: number;
      name: string;
      nip: string;
      signature: string;
      workUnit?: string;
      sourceRole?: string;
    }>();

    // 1. Dari profil users jika ada signature tersimpan
    usrs.forEach((u: any) => {
      if (u.signature && typeof u.signature === 'string' && u.signature.startsWith('data:image')) {
        sigMap.set(`user_${u.id}`, {
          userId: u.id,
          name: u.name,
          nip: u.nip || "",
          signature: u.signature,
          workUnit: u.work_unit || "",
          sourceRole: "Profil User",
        });
      }
    });

    // 2. Dari riwayat seluruh requests (auto-harvest tanda tangan yang pernah ada)
    allHistoricalRequests.forEach((r: any) => {
      if (r.requester_signature) {
        const u = usrs.find((usr: any) => usr.id === r.requester_id);
        const name = u?.name || (r.requester_notes ? r.requester_notes.split(" (")[0] : null);
        const nip = u?.nip || (r.requester_notes && r.requester_notes.includes("(") ? r.requester_notes.split("(")[1].replace(")", "") : "");
        const key = u ? `user_${u.id}` : (name ? `name_${name.toLowerCase()}` : "");
        if (key && name && !sigMap.has(key)) {
          sigMap.set(key, {
            userId: r.requester_id || 0,
            name: name,
            nip: nip,
            signature: r.requester_signature,
            workUnit: u?.work_unit || r.fungsi_bagian || "",
            sourceRole: "Pemohon",
          });
        }
      }
      if (r.verifier_signature && r.verifier_id) {
        const u = usrs.find((usr: any) => usr.id === r.verifier_id);
        const key = u ? `user_${u.id}` : `verifier_${r.verifier_id}`;
        if (u && !sigMap.has(key)) {
          sigMap.set(key, {
            userId: r.verifier_id,
            name: u.name,
            nip: u.nip || "",
            signature: r.verifier_signature,
            workUnit: u.work_unit || "Verifikator",
            sourceRole: "Verifikator",
          });
        }
      }
      if (r.supervisor_signature && r.supervisor_id) {
        const u = usrs.find((usr: any) => usr.id === r.supervisor_id);
        const key = u ? `user_${u.id}` : `supervisor_${r.supervisor_id}`;
        if (u && !sigMap.has(key)) {
          sigMap.set(key, {
            userId: r.supervisor_id,
            name: u.name,
            nip: u.nip || "",
            signature: r.supervisor_signature,
            workUnit: u.work_unit || "Penanggung Jawab",
            sourceRole: "Penanggung Jawab",
          });
        }
      }
    });

    setSignatureBank(Array.from(sigMap.values()));

    const stockMap = new Map<string, number>();
    const add = (name: string, qty: any) => {
      if (!name) return;
      const key = name.trim().toLowerCase();
      stockMap.set(key, (stockMap.get(key) || 0) + (Number(qty) || 0));
    };
    const sub = (name: string, qty: any) => {
      if (!name) return;
      const key = name.trim().toLowerCase();
      stockMap.set(key, (stockMap.get(key) || 0) - (Number(qty) || 0));
    };

    initialBalances.forEach((b: any) => add(b.item_name, b.quantity));
    pItems.forEach((pi: any) => add(pi.item_name, pi.quantity));
    tMasukItems.forEach((ti: any) => add(ti.item_name, ti.quantity));
    tKeluarItems.forEach((ti: any) => sub(ti.item_name, ti.quantity));

    const appIds = new Set(requests.map((r: any) => r.id));
    rItems.forEach((ri: any) => { if (appIds.has(ri.request_id)) sub(ri.final_item_name || ri.item_name, ri.quantity); });
    requestsNew.forEach((r: any) => (r.items || []).forEach((ri: any) => sub(ri.name, ri.quantity)));

    // Gabungkan seluruh katalog item dari Master ATK, Transfer Masuk, Pembelian, dan Saldo Awal
    const itemCatalog = new Map<string, { id?: number; item_code?: string; name: string; unit: string; created_at?: string }>();

    masterItems.forEach((m: any) => {
      if (m && m.name) {
        itemCatalog.set(m.name.trim().toLowerCase(), {
          id: m.id,
          item_code: m.item_code || "",
          name: m.name.trim(),
          unit: m.unit || "pcs",
          created_at: m.created_at || new Date().toISOString(),
        });
      }
    });

    tMasukItems.forEach((ti: any) => {
      if (ti && ti.item_name) {
        const key = ti.item_name.trim().toLowerCase();
        if (!itemCatalog.has(key)) {
          itemCatalog.set(key, {
            id: -(itemCatalog.size + 1),
            item_code: "TM",
            name: ti.item_name.trim(),
            unit: ti.unit || "pcs",
            created_at: new Date().toISOString(),
          });
        }
      }
    });

    pItems.forEach((pi: any) => {
      if (pi && pi.item_name) {
        const key = pi.item_name.trim().toLowerCase();
        if (!itemCatalog.has(key)) {
          itemCatalog.set(key, {
            id: -(itemCatalog.size + 1),
            item_code: "BELI",
            name: pi.item_name.trim(),
            unit: pi.unit || "pcs",
            created_at: new Date().toISOString(),
          });
        }
      }
    });

    initialBalances.forEach((bi: any) => {
      if (bi && bi.item_name) {
        const key = bi.item_name.trim().toLowerCase();
        if (!itemCatalog.has(key)) {
          itemCatalog.set(key, {
            id: -(itemCatalog.size + 1),
            item_code: "SA",
            name: bi.item_name.trim(),
            unit: bi.unit || "pcs",
            created_at: new Date().toISOString(),
          });
        }
      }
    });

    // Otomatis daftarkan barang baru ke tabel atk_items jika belum ada di Master ATK
    for (const [, item] of itemCatalog.entries()) {
      if (item.id && item.id < 0) {
        db.atk_items.add({
          item_code: item.item_code === "TM" || item.item_code === "BELI" || item.item_code === "SA" ? "" : item.item_code,
          name: item.name,
          unit: item.unit,
        }).then((newId: number) => {
          item.id = newId;
        }).catch((e: any) => console.warn("Auto-sync item to master failed:", e));
      }
    }

    const withStock = Array.from(itemCatalog.values()).map((item: any) => ({
      ...item,
      stock: stockMap.get(item.name.toLowerCase()) || 0
    })).filter((m: any) => m.stock > 0);

    setItemsWithStock(withStock);
    setLoading(false);
  }

  const openItemSelector = (i: number) => {
    setSelectedIndex(i);
    setSearchQuery("");
    setShowItemModal(true);
  };

  const selectItem = (atk: ATKItem & { stock: number }) => {
    const newItems = [...editedItems];
    newItems[selectedIndex] = { name: atk.name, quantity: 1, unit: atk.unit };
    setEditedItems(newItems);
    setShowItemModal(false);
  };

  const addItem = () => {
    setEditedItems([...editedItems, { name: "", quantity: 1, unit: "pcs" }]);
  };

  const removeItem = async (index: number) => {
    if (editedItems.length <= 1) {
      await alert("Minimal harus ada 1 item");
      return;
    }
    setEditedItems(editedItems.filter((_, i) => i !== index));
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (user) {
      setVerifierName(user.name);
      setVerifierNIP(user.nip);
      setApproverName(user.name);
      setApproverNIP(user.nip);
    }
  }, [user]);

  const getUser = (id: number | null) => {
    if (!id) return null;
    return users.find((u) => u.id === id);
  };

  const statusLabels: Record<string, string> = {
    pending_verification: "Menunggu Verifikasi",
    verified: "Terverifikasi - Menunggu Persetujuan",
    approved: "Disetujui",
    rejected: "Ditolak",
    revision_requested: "Perlu Revisi",
  };

  const statusStyles: Record<string, string> = {
    pending_verification: "bg-yellow-100 text-yellow-700",
    verified: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    revision_requested: "bg-orange-100 text-orange-700",
  };

  // WhatsApp reminder
  const sendWhatsAppReminder = async () => {
    if (!settings?.whatsapp_number) {
      await alert("Nomor WhatsApp belum diatur di Pengaturan");
      return;
    }
    const requester = users.find((u) => u.id === request!.requester_id) || getUser(request!.requester_id);
    const message = encodeURIComponent(
      `📋 *Formulir Permintaan ATK*\n` +
        `No. Dokumen: ${effectiveDocNumber}\n` +
        `Pemohon: ${requester?.name || "Unknown"}\n` +
        `Status: ${statusLabels[request!.status]}\n` +
        `Tanggal: ${new Date(request!.submission_date).toLocaleDateString("id-ID")}\n\n` +
        `Mohon segera ditindaklanjuti. Terima kasih.`,
    );
    window.open(
      `https://wa.me/${settings.whatsapp_number}?text=${message}`,
      "_blank",
    );
  };

  // Print PDF
  const handlePrint = () => {
    window.print();
  };

  // Verify with signature
  const handleVerify = async () => {
    if (!request || !user) return;
    if (!verifierName.trim()) {
      await alert("Masukkan nama verifikator");
      return;
    }

    const signature = verifierSigRef.current?.isEmpty()
      ? null
      : verifierSigRef.current?.toDataURL();

    const selectedUser = users.find((u) => u.id === editRequesterId);

    setActionLoading(true);
    await db.requests.update(request.id!, {
      document_number: effectiveDocNumber,
      status: "verified",
      requester_id: editRequesterId,
      fungsi_bagian: editFungsiBagian,
      document_date: editDocumentDate,
      book_date: editBookDate,
      submission_date: editDocumentDate,
      submission_location: editLocation,
      requester_notes: selectedUser ? `${selectedUser.name} (${selectedUser.nip})` : request.requester_notes,
      requester_signature: editRequesterSignature !== null ? editRequesterSignature : request.requester_signature,
      verifier_id: user.id,
      verification_date: new Date().toISOString().split("T")[0],
      verifier_signature: signature,
      verification_notes: `${verifierName} (${verifierNIP})${verifierNotes ? " - " + verifierNotes : ""}`,
      items: editedItems,
      updated_at: new Date().toISOString(),
    });
    setShowVerifyModal(false);
    navigate("/app/verification");
  };

  // Approve with signature
  const handleApprove = async () => {
    if (!request || !user) return;
    if (!approverName.trim()) {
      await alert("Masukkan nama penanggung jawab");
      return;
    }

    const signature = supervisorSigRef.current?.isEmpty()
      ? null
      : supervisorSigRef.current?.toDataURL();

    const selectedUser = users.find((u) => u.id === editRequesterId);

    setActionLoading(true);
    await db.requests.update(request.id!, {
      document_number: effectiveDocNumber,
      status: "approved",
      requester_id: editRequesterId,
      fungsi_bagian: editFungsiBagian,
      document_date: editDocumentDate,
      book_date: editBookDate,
      submission_date: editDocumentDate,
      submission_location: editLocation,
      requester_notes: selectedUser ? `${selectedUser.name} (${selectedUser.nip})` : request.requester_notes,
      requester_signature: editRequesterSignature !== null ? editRequesterSignature : request.requester_signature,
      supervisor_id: user.id,
      approval_date: new Date().toISOString().split("T")[0],
      supervisor_signature: signature,
      approval_notes: `${approverName} (${approverNIP})${approverNotes ? " - " + approverNotes : ""}`,
      items: editedItems,
      updated_at: new Date().toISOString(),
    });
    setShowApproveModal(false);
    navigate("/app/approval");
  };

  const handleReject = async () => {
    const reason = await prompt("Masukkan alasan penolakan:", { placeholder: "Tulis alasan..." });
    if (!reason || !request || !user) return;
    setActionLoading(true);
    await db.requests.update(request.id!, {
      status: "rejected",
      rejection_reason: reason,
      rejected_by: user.id,
      updated_at: new Date().toISOString(),
    });
    navigate(-1);
  };

  const handleRevision = async () => {
    const notes = await prompt("Masukkan catatan revisi:", { placeholder: "Tulis catatan..." });
    if (!notes || !request || !user) return;
    setActionLoading(true);
    await db.requests.update(request.id!, {
      status: "revision_requested",
      verification_notes: notes,
      verifier_id: user.id,
      updated_at: new Date().toISOString(),
    });
    navigate("/app/verification");
  };

  const handleSaveAdmin = async () => {
    if (!request || !user) return;
    setActionLoading(true);
    try {
      const selectedUser = users.find((u) => u.id === editRequesterId);
      await db.requests.update(request.id!, {
        document_number: effectiveDocNumber,
        requester_id: editRequesterId,
        fungsi_bagian: editFungsiBagian,
        document_date: editDocumentDate,
        book_date: editBookDate,
        submission_date: editDocumentDate,
        submission_location: editLocation,
        requester_notes: selectedUser ? `${selectedUser.name} (${selectedUser.nip})` : request.requester_notes,
        requester_signature: editRequesterSignature,
        items: editedItems,
        updated_at: new Date().toISOString(),
      });

      // Simpan juga ke user profile jika ada tanda tangan baru
      if (editRequesterSignature && selectedUser) {
        db.users.update(selectedUser.id, { signature: editRequesterSignature }).catch(() => {});
      }

      await alert("Perubahan data permintaan berhasil disimpan");
      loadData();
    } catch (err) {
      await alert("Gagal menyimpan: " + (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const saveNewSignatureToState = (sigData: string) => {
    setEditRequesterSignature(sigData);
    if (saveToUserBank) {
      const curU = users.find(u => u.id === editRequesterId);
      const name = curU?.name || requester?.name || "Pegawai";
      const nip = curU?.nip || requester?.nip || "";
      const workUnit = curU?.work_unit || requester?.work_unit || "";

      setSignatureBank(prev => {
        const key = curU ? curU.id : 0;
        const exists = prev.find(p => (key && p.userId === key) || (p.name.toLowerCase() === name.toLowerCase()));
        if (exists) {
          return prev.map(p => ((key && p.userId === key) || (p.name.toLowerCase() === name.toLowerCase())) ? { ...p, signature: sigData } : p);
        }
        return [{
          userId: key || Date.now(),
          name,
          nip,
          workUnit,
          signature: sigData,
          sourceRole: "Pemohon",
        }, ...prev];
      });

      if (curU && curU.id) {
        db.users.update(curU.id, { signature: sigData }).catch(() => {});
      }
    }
    setShowRequesterSigModal(false);
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12 text-slate-500">
        Permintaan tidak ditemukan
      </div>
    );
  }

  const requester = getUser(request.requester_id);
  const verifier = getUser(request.verifier_id);
  const supervisor = getUser(request.supervisor_id);

  const isAdmin = user?.role?.includes("admin");
  const isVerifier = user?.role?.some((r) => ["verifikator"].includes(r));
  const isSupervisor = user?.role?.some((r) => ["penanggungjawab"].includes(r));

  const canVerify =
    request.status === "pending_verification" &&
    (isVerifier || isAdmin);
  const canApprove =
    request.status === "verified" &&
    (isSupervisor || isAdmin);
  const canEdit = Boolean(isAdmin || isVerifier || isSupervisor);

  // Parse names from notes
  const getVerifierDisplayName = () => {
    if (request.verification_notes) {
      const match = request.verification_notes.match(/^(.+?) \((.+?)\)/);
      if (match) return { name: match[1], nip: match[2] };
    }
    return verifier ? { name: verifier.name, nip: verifier.nip } : null;
  };

  const getApproverDisplayName = () => {
    if (request.approval_notes) {
      const match = request.approval_notes.match(/^(.+?) \((.+?)\)/);
      if (match) return { name: match[1], nip: match[2] };
    }
    return supervisor ? { name: supervisor.name, nip: supervisor.nip } : null;
  };

  const verifierDisplay = getVerifierDisplayName();
  const approverDisplay = getApproverDisplayName();
  const effectiveRequester = users.find((u) => u.id === editRequesterId) || requester;

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

  return (
    <div>
      <Dialog state={dialogState} onClose={closeDialog} />
      {/* Header - no print */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft size={20} />
          Kembali
        </button>
        <div className="flex gap-2">
          <button
            onClick={sendWhatsAppReminder}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
          >
            <MessageSquare size={18} />
            WhatsApp
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-xl font-semibold hover:bg-slate-700"
          >
            <Printer size={18} />
            Cetak PDF
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DEDICATED OFFICIAL PRINT TEMPLATE (STANDAR NASKAH DINAS RESMI BPS / SAKTI) */}
      {/* ========================================================================= */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-form-container {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
      <div className="hidden print:block font-sans text-black leading-normal print-form-container">
        {/* KOP RESMI DOKUMEN BPS */}
        <div className="flex items-center gap-3 pb-1.5 border-b-2 border-black">
          <img
            src={settings?.logo_url || "/bpslogo.svg"}
            alt="Logo BPS"
            className="h-14 w-14 object-contain"
          />
          <div className="flex-1 text-center">
            <h1 className="text-xs font-extrabold uppercase tracking-widest text-black">
              {settings?.org_name || "BADAN PUSAT STATISTIK KEPULAUAN SERIBU"}
            </h1>
            <h2 className="text-sm font-black uppercase tracking-wide text-black mt-0.5">
              FORMULIR PERMINTAAN ALAT TULIS KANTOR (ATK)
            </h2>
            <p className="text-[10px] font-medium text-slate-800 mt-0.5">
              Tahun Anggaran {settings?.budget_year || new Date().getFullYear()}
              {settings?.address ? ` • ${settings.address}` : ""}
              {settings?.city ? `, ${settings.city}` : ""}
            </p>
          </div>
          <div className="w-14 hidden sm:block"></div>
        </div>
        {/* Garis ganda khas kop surat kedinasan */}
        <div className="border-b border-black mt-[1.5px] mb-2.5"></div>

        {/* TABEL IDENTITAS & TANGGAL SAKTI (2 KOLOM RESMI) */}
        <table className="w-full text-[11px] mb-2.5 border-collapse">
          <tbody>
            <tr>
              <td className="w-32 py-0.5 font-semibold text-slate-800">Nomor Dokumen</td>
              <td className="w-3 py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 font-bold font-mono text-black">{effectiveDocNumber}</td>

              <td className="w-36 py-0.5 font-semibold text-slate-800">Tanggal Dokumen</td>
              <td className="w-3 py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 font-semibold text-black">
                {formatIndoDate(editDocumentDate || request.document_date || request.submission_date)}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 font-semibold text-slate-800">Nama Pemohon</td>
              <td className="py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 font-bold text-black">
                {effectiveRequester?.name || "Unknown"}
              </td>

              <td className="py-0.5 font-semibold text-slate-800">Tanggal Buku (SAKTI)</td>
              <td className="py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 font-semibold text-black">
                {formatIndoDate(editBookDate || request.book_date || request.submission_date)}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 font-semibold text-slate-800">NIP Pemohon</td>
              <td className="py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 text-black font-mono">
                {effectiveRequester?.nip ? `NIP. ${effectiveRequester.nip}` : "-"}
              </td>

              <td className="py-0.5 font-semibold text-slate-800">Fungsi / Bagian</td>
              <td className="py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 font-semibold text-black">
                {editFungsiBagian || effectiveRequester?.work_unit || "-"}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 font-semibold text-slate-800">Lokasi Pengajuan</td>
              <td className="py-0.5 text-center font-bold">:</td>
              <td className="py-0.5 text-black" colSpan={4}>
                {editLocation || request.submission_location || "Kepulauan Seribu"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABEL DAFTAR BARANG YANG DIMINTA */}
        <div className="mb-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide mb-1 text-black">
            Daftar Barang yang Diminta:
          </div>
          <table className="w-full text-[11px] border border-black border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-black">
                <th className="border-r border-black py-1 px-2 text-center w-10 font-bold uppercase">No</th>
                <th className="border-r border-black py-1 px-2.5 text-left font-bold uppercase">Nama Barang / Spesifikasi</th>
                <th className="border-r border-black py-1 px-2.5 text-center w-24 font-bold uppercase">Jumlah</th>
                <th className="py-1 px-2.5 text-center w-24 font-bold uppercase">Satuan</th>
              </tr>
            </thead>
            <tbody>
              {editedItems.map((item, idx) => (
                <tr key={idx} className="border-b border-black">
                  <td className="border-r border-black py-1 px-2 text-center font-medium">{idx + 1}</td>
                  <td className="border-r border-black py-1 px-2.5 font-semibold text-black">{item.name}</td>
                  <td className="border-r border-black py-1 px-2.5 text-center font-bold text-black">{item.quantity}</td>
                  <td className="py-1 px-2.5 text-center text-black">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CATATAN / ALASAN PENOLAKAN JIKA ADA */}
        {request.status === "rejected" && request.rejection_reason && (
          <div className="mb-2.5 p-2 border border-red-700 bg-red-50 text-[10px]">
            <span className="font-bold text-red-900">Alasan Penolakan: </span>
            <span className="text-red-800">{request.rejection_reason}</span>
          </div>
        )}

        {/* BLOK TANDA TANGAN 3 KOLOM RESMI NASKAH DINAS */}
        <div className="mt-3">
          <div className="text-right text-[11px] mb-1.5 font-medium text-slate-900">
            {editLocation || request.submission_location || "Kepulauan Seribu"},{" "}
            {formatIndoDate(editDocumentDate || request.document_date || request.submission_date)}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            {/* Kolom 1: Pemohon */}
            <div className="flex flex-col justify-between h-24">
              <div>
                <div className="font-bold text-black text-[11px]">Pemohon,</div>
                <div className="text-[9.5px] text-slate-700">{editFungsiBagian || "Pegawai"}</div>
              </div>
              <div className="my-auto flex items-center justify-center h-12">
                {(editRequesterSignature || request.requester_signature) ? (
                  <img
                    src={(editRequesterSignature || request.requester_signature)!}
                    alt="TTD Pemohon"
                    className="max-h-11 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-slate-300 text-[9.5px] italic">(Tanda Tangan Digital)</span>
                )}
              </div>
              <div>
                <div className="font-bold underline text-black text-[11px]">
                  {effectiveRequester?.name || "Unknown"}
                </div>
                <div className="text-[9.5px] text-slate-800">
                  {effectiveRequester?.nip ? `NIP. ${effectiveRequester.nip}` : "-"}
                </div>
              </div>
            </div>

            {/* Kolom 2: Verifikator */}
            <div className="flex flex-col justify-between h-24">
              <div>
                <div className="font-bold text-black text-[11px]">Diverifikasi Oleh,</div>
                <div className="text-[9.5px] text-slate-700">Pengelola Barang Persediaan</div>
              </div>
              <div className="my-auto flex items-center justify-center h-12">
                {request.verifier_signature ? (
                  <img
                    src={request.verifier_signature}
                    alt="TTD Verifikator"
                    className="max-h-11 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-slate-300 text-[9.5px] italic">(Tanda Tangan Digital)</span>
                )}
              </div>
              <div>
                <div className="font-bold underline text-black text-[11px]">
                  {verifierDisplay ? verifierDisplay.name : (verifier?.name || "-")}
                </div>
                <div className="text-[9.5px] text-slate-800">
                  {verifierDisplay && verifierDisplay.nip ? `NIP. ${verifierDisplay.nip}` : (verifier?.nip ? `NIP. ${verifier?.nip}` : "-")}
                </div>
              </div>
            </div>

            {/* Kolom 3: Penanggung Jawab */}
            <div className="flex flex-col justify-between h-24">
              <div>
                <div className="font-bold text-black text-[11px]">Menyetujui,</div>
                <div className="text-[9.5px] text-slate-700">
                  {settings?.official_job && settings.official_job !== "Pejabat Pembuat Komitmen"
                    ? settings.official_job
                    : "Kepala Subbagian Umum"}
                </div>
              </div>
              <div className="my-auto flex items-center justify-center h-12">
                {request.supervisor_signature ? (
                  <img
                    src={request.supervisor_signature}
                    alt="TTD Penanggung Jawab"
                    className="max-h-11 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-slate-300 text-[9.5px] italic">(Tanda Tangan Digital)</span>
                )}
              </div>
              <div>
                <div className="font-bold underline text-black text-[11px]">
                  {approverDisplay ? approverDisplay.name : (supervisor?.name || settings?.official_name || "-")}
                </div>
                <div className="text-[9.5px] text-slate-800">
                  {approverDisplay && approverDisplay.nip ? `NIP. ${approverDisplay.nip}` : (supervisor?.nip ? `NIP. ${supervisor?.nip}` : (settings?.official_nip ? `NIP. ${settings?.official_nip}` : "-"))}
                </div>
              </div>
            </div>
          </div>

          {/* DIGITAL VERIFICATION FOOTNOTE WITH QR CODE & SATRIA URL */}
          <div className="mt-3 pt-2 border-t border-black flex items-center justify-between text-[8px] text-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="border border-black p-0.5 bg-white shrink-0">
                <QRCodeImage
                  text={`${window.location.origin}/verify/request/${request.id}`}
                  size={46}
                />
              </div>
              <div className="space-y-0.5 leading-tight">
                <div className="font-bold uppercase tracking-wider text-black text-[8px]">
                  Verifikasi Keabsahan Naskah Dinas Elektronik &bull; SATRIA BPS Kepulauan Seribu
                </div>
                <div className="text-slate-700 text-[7.5px]">
                  Dokumen ini sah dan diterbitkan secara elektronik melalui Sistem SATRIA ATK.
                </div>
                <div className="text-[7.5px]">
                  Pindai QR Code di samping atau akses tautan verifikasi:{" "}
                  <span className="font-mono font-bold text-blue-900 underline">
                    {`${window.location.origin}/verify/request/${request.id}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right font-mono text-[7px] text-slate-500 shrink-0">
              <div>SISTEM SATRIA</div>
              <div>BPS KEPULAUAN SERIBU</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE ON-SCREEN CONTENT (DISEMBUNYIKAN SAAT CETAK PDF)              */}
      {/* ========================================================================= */}
      <div className="print:hidden bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
        {/* Header dengan gradient background */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 px-6 py-5 text-white">
          <div className="flex items-center gap-4">
            {settings?.logo_url && (
              <img
                src={settings.logo_url}
                alt="Logo"
                className="h-16 w-16 object-contain bg-white rounded-xl p-1 print:h-14 print:w-14"
              />
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold print:text-lg print:text-slate-800">
                FORMULIR PERMINTAAN ATK
              </h2>
              <p className="text-blue-100 print:text-slate-600">
                {settings?.org_name || "BPS Kepulauan Seribu"}
              </p>
              <p className="text-sm text-blue-200 print:text-slate-500 print:text-xs">
                Tahun Anggaran{" "}
                {settings?.budget_year || new Date().getFullYear()}
              </p>
            </div>
            <div className="text-right">
              <div className={canEdit ? "hidden print:block text-2xl font-bold print:text-base print:text-slate-800" : "text-2xl font-bold print:text-base print:text-slate-800"}>
                {effectiveDocNumber}
              </div>

              {canEdit && (
                <div className="print:hidden flex items-center justify-end gap-1 font-mono text-lg sm:text-xl font-bold text-white mb-1">
                  <span className="text-blue-100 select-none text-base sm:text-lg">{docNumberPrefix}</span>
                  <input
                    type="text"
                    title="Ubah Bulan Nomor Dokumen"
                    value={docNumberMonth}
                    onChange={(e) => setDocNumberMonth(e.target.value)}
                    className="w-12 sm:w-16 text-center bg-white text-blue-900 font-extrabold px-1.5 py-0.5 rounded-lg border-2 border-amber-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none text-base sm:text-lg shadow-md"
                    placeholder="Bulan"
                  />
                  <span className="text-blue-100 select-none text-base sm:text-lg">{docNumberSuffix}</span>
                </div>
              )}

              <div className="text-sm text-blue-100 print:text-slate-700 font-medium">
                Tgl Dokumen: {editDocumentDate ? new Date(editDocumentDate).toLocaleDateString("id-ID") : new Date(request.submission_date).toLocaleDateString("id-ID")}
              </div>
              <div className="text-xs text-blue-200 print:text-slate-500">
                Tgl Buku: {editBookDate ? new Date(editBookDate).toLocaleDateString("id-ID") : new Date(request.submission_date).toLocaleDateString("id-ID")}
              </div>
            </div>
          </div>
        </div>

        {/* Status badge - larger and more prominent */}
        <div className="px-6 py-4 border-b border-slate-100 print:hidden flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-base font-bold ${statusStyles[request.status] || "bg-gray-100"}`}
          >
            {request.status === "approved" && <CheckCircle size={20} />}
            {request.status === "rejected" && <XCircle size={20} />}
            {statusLabels[request.status] || request.status}
          </span>
          {canEdit && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl font-medium">
              Mode Editor Aktif: Anda dapat mengubah Nomor Bulan, Pemohon, Fungsi/Bagian, dan Tanggal SAKTI
            </span>
          )}
        </div>

        {/* Info grid - with icons and interactive editor for authorized roles */}
        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:px-0 print:gap-2">
          {/* Card 1: Pemohon */}
          <div className="bg-gradient-to-br from-blue-50 to-slate-50 border border-slate-200 rounded-xl p-4 print:border-slate-400 print:p-2 print:bg-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-blue-600">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Pemohon
                  </span>
                </div>
                {canEdit && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium print:hidden">
                    Ubah Pemohon
                  </span>
                )}
              </div>

              {canEdit ? (
                <div className="print:hidden space-y-1">
                  <select
                    value={editRequesterId}
                    onChange={(e) => {
                      const newId = Number(e.target.value);
                      setEditRequesterId(newId);
                      const sel = users.find((u) => u.id === newId);
                      if (sel && sel.work_unit) {
                        setEditFungsiBagian(sel.work_unit);
                      }
                      // Auto-match tanda tangan jika pegawai ini sudah memiliki data tanda tangan di bank
                      const matched = signatureBank.find(
                        s => (sel && s.userId === sel.id) ||
                             (sel && s.name.toLowerCase() === sel.name.toLowerCase()) ||
                             (sel && sel.nip && s.nip === sel.nip)
                      );
                      if (matched) {
                        setEditRequesterSignature(matched.signature);
                      }
                    }}
                    className="w-full text-sm font-semibold text-slate-800 bg-white border border-blue-300 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.nip})
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-blue-600">
                    NIP: {users.find((u) => u.id === editRequesterId)?.nip || "-"}
                  </div>
                </div>
              ) : null}

              <div className={canEdit ? "hidden print:block" : ""}>
                <div className="font-bold text-slate-800 text-lg">
                  {users.find((u) => u.id === editRequesterId)?.name || requester?.name || "Unknown"}
                </div>
                <div className="text-slate-500 text-sm">
                  {users.find((u) => u.id === editRequesterId)?.nip ? `NIP. ${users.find((u) => u.id === editRequesterId)?.nip}` : ""}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Lokasi */}
          <div className="bg-gradient-to-br from-green-50 to-slate-50 border border-slate-200 rounded-xl p-4 print:border-slate-400 print:p-2 print:bg-white flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Lokasi Pengajuan
                </span>
              </div>
              {canEdit ? (
                <div className="print:hidden">
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-800 bg-white border border-green-300 rounded-xl p-2 focus:ring-2 focus:ring-green-500 focus:outline-none"
                  />
                </div>
              ) : null}
              <div className={canEdit ? "hidden print:block font-bold text-slate-800 text-lg" : "font-bold text-slate-800 text-lg"}>
                {editLocation || request.submission_location}
              </div>
            </div>
          </div>

          {/* Card 3: Fungsi/Bagian */}
          <div className="bg-gradient-to-br from-orange-50 to-slate-50 border border-slate-200 rounded-xl p-4 print:border-slate-400 print:p-2 print:bg-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-orange-600">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Fungsi / Bagian
                  </span>
                </div>
                {canEdit && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium print:hidden">
                    Auto-update
                  </span>
                )}
              </div>
              {canEdit ? (
                <div className="print:hidden">
                  <select
                    value={editFungsiBagian}
                    onChange={(e) => setEditFungsiBagian(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-800 bg-white border border-orange-300 rounded-xl p-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Fungsi/Bagian --</option>
                    {WORK_UNIT_OPTIONS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className={canEdit ? "hidden print:block font-bold text-slate-800 text-lg" : "font-bold text-slate-800 text-lg"}>
                {editFungsiBagian || "-"}
              </div>
            </div>
          </div>

          {/* Card 4: Tanggal Dokumen & Tanggal Buku */}
          <div className="bg-gradient-to-br from-purple-50 to-slate-50 border border-slate-200 rounded-xl p-4 print:border-slate-400 print:p-2 print:bg-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-purple-600">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Tanggal (SAKTI)
                  </span>
                </div>
                {canEdit && (
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium print:hidden">
                    Dokumen & Buku
                  </span>
                )}
              </div>
              {canEdit ? (
                <div className="space-y-2 print:hidden">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      Tgl Dokumen
                    </label>
                    <input
                      type="date"
                      value={editDocumentDate}
                      onChange={(e) => setEditDocumentDate(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 bg-white border border-purple-300 rounded-lg p-1.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      Tgl Buku (SAKTI)
                    </label>
                    <input
                      type="date"
                      value={editBookDate}
                      onChange={(e) => setEditBookDate(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 bg-white border border-purple-300 rounded-lg p-1.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : null}
              <div className={canEdit ? "hidden print:block text-xs space-y-1" : "text-xs space-y-1"}>
                <div>
                  <span className="text-slate-500">Tgl Dokumen: </span>
                  <span className="font-bold text-slate-800">
                    {editDocumentDate ? new Date(editDocumentDate).toLocaleDateString("id-ID") : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Tgl Buku: </span>
                  <span className="font-bold text-purple-700">
                    {editBookDate ? new Date(editBookDate).toLocaleDateString("id-ID") : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Items table - modern styling */}
        <div className="px-6 pb-6 print:px-0">
          <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 print:text-xs">
            <svg
              className="w-4 h-4 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            Daftar Barang yang Diminta
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 print:rounded-none">
            <table className="w-full text-sm print:text-xs">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-12">
                    No
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Nama Barang
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase w-28">
                    Jumlah
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-28">
                    Satuan
                  </th>
                  {canEdit && <th className="px-4 py-3 w-12 print:hidden"></th>}
                </tr>
              </thead>
              <tbody>
                {editedItems.map((item, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >
                    <td className="px-4 py-3 text-center font-semibold text-slate-500">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {canEdit ? (
                        <button
                          onClick={() => openItemSelector(i)}
                          className="w-full text-left px-2 py-1 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors border border-transparent hover:border-blue-200"
                        >
                          {item.name || <span className="text-slate-400">Pilih Barang...</span>}
                        </button>
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-blue-600">
                      {canEdit ? (
                        <input
                          type="number"
                          value={editedItems[i]?.quantity || 0}
                          onChange={(e) => {
                            const newItems = [...editedItems];
                            newItems[i].quantity = Number(e.target.value);
                            setEditedItems(newItems);
                          }}
                          className="w-20 px-2 py-1 border border-blue-300 rounded text-center focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-center print:hidden">
                        <button 
                          onClick={() => removeItem(i)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus Item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 print:hidden text-center">
              <button 
                onClick={addItem}
                className="inline-flex items-center gap-2 px-6 py-2 bg-white border-2 border-dashed border-slate-300 text-slate-500 rounded-xl font-bold hover:border-blue-400 hover:text-blue-600 transition-all text-sm shadow-sm"
              >
                <Plus size={16} />
                Tambah Baris Barang
              </button>
            </div>
          )}
        </div>

        {/* Rejection info */}
        {request.status === "rejected" && request.rejection_reason && (
          <div className="mx-6 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl print:bg-white print:border-red-400">
            <div className="text-sm font-semibold text-red-700 mb-1">
              Alasan Penolakan:
            </div>
            <p className="text-red-600">{request.rejection_reason}</p>
          </div>
        )}

        {/* Signatures section - INLINE for print */}
        <div className="mx-6 mb-6 pt-6 border-t-2 border-slate-200 print:mx-0">
          <div className="text-sm font-semibold text-slate-700 mb-4 print:text-xs">
            Tanda Tangan
          </div>

          {/* Use flex for inline layout on print */}
          <div
            className="flex gap-4 print:gap-2"
            style={{ display: "flex", flexWrap: "nowrap" }}
          >
            {/* Pemohon */}
            <div
              className="flex-1 text-center border border-slate-200 rounded-lg p-3 print:p-2 print:border-slate-400"
              style={{ minWidth: "30%" }}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-2">
                <span>Pemohon</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowRequesterSigModal(true)}
                    className="print:hidden text-[10px] text-blue-600 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1 transition-colors"
                    title="Ubah tanda tangan pemohon (Khusus Admin)"
                  >
                    <Edit size={11} />
                    Ubah TTD
                  </button>
                )}
              </div>
              <div className="h-20 flex items-center justify-center print:h-16">
                {editRequesterSignature ? (
                  <img
                    src={editRequesterSignature}
                    alt="TTD Pemohon"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-slate-300 text-xs">-</span>
                )}
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2 print:border-slate-400">
                {request.requester_notes ? (
                  (() => {
                    const match = request.requester_notes.match(
                      /^(.+?)(?: \((.+?)\))?$/,
                    );
                    return (
                      <>
                        <div className="font-semibold text-slate-800 text-sm print:text-xs">
                          {match ? match[1] : request.requester_notes}
                        </div>
                        <div className="text-xs text-slate-500">
                          {match && match[2] ? match[2] : requester?.nip}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <div className="font-semibold text-slate-800 text-sm print:text-xs">
                      {requester?.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {requester?.nip}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Verifikator */}
            <div
              className="flex-1 text-center border border-slate-200 rounded-lg p-3 print:p-2 print:border-slate-400"
              style={{ minWidth: "30%" }}
            >
              <div className="text-xs font-semibold text-slate-600 mb-2">
                Verifikator
              </div>
              <div className="h-20 flex items-center justify-center print:h-16">
                {request.verifier_signature ? (
                  <img
                    src={request.verifier_signature}
                    alt="TTD"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-slate-300 text-xs">
                    {request.status === "pending_verification"
                      ? "Menunggu"
                      : "-"}
                  </span>
                )}
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2 print:border-slate-400">
                {verifierDisplay ? (
                  <>
                    <div className="font-semibold text-slate-800 text-sm print:text-xs">
                      {verifierDisplay.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {verifierDisplay.nip}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-400 text-xs">
                    Belum diverifikasi
                  </div>
                )}
              </div>
            </div>

            {/* Penanggung Jawab */}
            <div
              className="flex-1 text-center border border-slate-200 rounded-lg p-3 print:p-2 print:border-slate-400"
              style={{ minWidth: "30%" }}
            >
              <div className="text-xs font-semibold text-slate-600 mb-2">
                Penanggung Jawab
              </div>
              <div className="h-20 flex items-center justify-center print:h-16">
                {request.supervisor_signature ? (
                  <img
                    src={request.supervisor_signature}
                    alt="TTD"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-slate-300 text-xs">
                    {["pending_verification", "revision_requested"].includes(
                      request.status,
                    )
                      ? "Menunggu"
                      : request.status === "verified"
                        ? "Menunggu"
                        : "-"}
                  </span>
                )}
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2 print:border-slate-400">
                {approverDisplay ? (
                  <>
                    <div className="font-semibold text-slate-800 text-sm print:text-xs">
                      {approverDisplay.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {approverDisplay.nip}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-400 text-xs">Belum disetujui</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons - no print */}
        {(canVerify || canApprove || canEdit) && (
          <div className="flex flex-wrap gap-3 pt-6 mt-6 border-t border-slate-200 print:hidden">
            {canVerify && (
              <>
                <button
                  onClick={() => setShowVerifyModal(true)}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
                >
                  <CheckCircle size={20} /> Verifikasi
                </button>
                <button
                  onClick={handleRevision}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-60"
                >
                  <Edit size={20} /> Minta Revisi
                </button>
              </>
            )}
            {canApprove && (
              <button
                onClick={() => setShowApproveModal(true)}
                disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
              >
                <CheckCircle size={20} /> Setujui
              </button>
            )}
            {(canVerify || canApprove) && (
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                <XCircle size={20} /> Tolak
              </button>
            )}
            {canEdit && (
              <button
                onClick={handleSaveAdmin}
                disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-lg shadow-blue-100"
              >
                <Save size={20} /> Simpan Perubahan Data
              </button>
            )}
          </div>
        )}
      </div>

      {/* Verify Modal with Name Input */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 my-8">
            <h2 className="text-xl font-bold mb-4 text-slate-800">Verifikasi Permintaan</h2>

            {/* Pemohon & Tanggal SAKTI editor */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 space-y-3 text-xs">
              <div className="font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span>Data Pemohon & Tanggal SAKTI</span>
                <span className="text-[10px] text-blue-600 font-normal">Dapat disesuaikan</span>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Nama Pemohon (Database User)
                </label>
                <select
                  value={editRequesterId}
                  onChange={(e) => {
                    const newId = Number(e.target.value);
                    setEditRequesterId(newId);
                    const sel = users.find((u) => u.id === newId);
                    if (sel && sel.work_unit) setEditFungsiBagian(sel.work_unit);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.nip})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Fungsi / Bagian</label>
                  <input
                    type="text"
                    value={editFungsiBagian}
                    onChange={(e) => setEditFungsiBagian(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Lokasi</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Tanggal Dokumen</label>
                  <input
                    type="date"
                    value={editDocumentDate}
                    onChange={(e) => setEditDocumentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-purple-700 mb-1">Tanggal Buku (SAKTI)</label>
                  <input
                    type="date"
                    value={editBookDate}
                    onChange={(e) => setEditBookDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-purple-300 bg-white font-medium text-purple-900 focus:outline-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Nama Verifikator <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={verifierName}
                  onChange={(e) => setVerifierName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  NIP Verifikator
                </label>
                <input
                  type="text"
                  value={verifierNIP}
                  onChange={(e) => setVerifierNIP(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Catatan (Opsional)
              </label>
              <input
                type="text"
                value={verifierNotes}
                onChange={(e) => setVerifierNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                placeholder="Tambahkan catatan verifikasi..."
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Tanda Tangan Verifikator
              </label>
              <div className="border-2 border-dashed border-blue-300 rounded-xl p-2 bg-blue-50">
                <SignatureCanvas
                  ref={verifierSigRef}
                  penColor="rgb(0, 100, 50)"
                  canvasProps={{
                    className:
                      "w-full h-32 bg-white rounded-lg cursor-crosshair",
                  }}
                />
              </div>
              <button
                onClick={() => verifierSigRef.current?.clear()}
                className="mt-2 text-sm text-red-500"
              >
                Hapus TTD
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-600"
              >
                Batal
              </button>
              <button
                onClick={handleVerify}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
              >
                Verifikasi Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal with Name Input */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 my-8">
            <h2 className="text-xl font-bold mb-4 text-slate-800">Persetujuan Akhir</h2>

            {/* Pemohon & Tanggal SAKTI editor */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 space-y-3 text-xs">
              <div className="font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span>Data Pemohon & Tanggal SAKTI</span>
                <span className="text-[10px] text-blue-600 font-normal">Dapat disesuaikan</span>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Nama Pemohon (Database User)
                </label>
                <select
                  value={editRequesterId}
                  onChange={(e) => {
                    const newId = Number(e.target.value);
                    setEditRequesterId(newId);
                    const sel = users.find((u) => u.id === newId);
                    if (sel && sel.work_unit) setEditFungsiBagian(sel.work_unit);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.nip})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Fungsi / Bagian</label>
                  <input
                    type="text"
                    value={editFungsiBagian}
                    onChange={(e) => setEditFungsiBagian(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Lokasi</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Tanggal Dokumen</label>
                  <input
                    type="date"
                    value={editDocumentDate}
                    onChange={(e) => setEditDocumentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-purple-700 mb-1">Tanggal Buku (SAKTI)</label>
                  <input
                    type="date"
                    value={editBookDate}
                    onChange={(e) => setEditBookDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-purple-300 bg-white font-medium text-purple-900 focus:outline-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Nama Penanggung Jawab <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  NIP
                </label>
                <input
                  type="text"
                  value={approverNIP}
                  onChange={(e) => setApproverNIP(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Catatan (Opsional)
              </label>
              <input
                type="text"
                value={approverNotes}
                onChange={(e) => setApproverNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                placeholder="Tambahkan catatan persetujuan..."
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Tanda Tangan Penanggung Jawab
              </label>
              <div className="border-2 border-dashed border-green-300 rounded-xl p-2 bg-green-50">
                <SignatureCanvas
                  ref={supervisorSigRef}
                  penColor="rgb(0, 80, 160)"
                  canvasProps={{
                    className:
                      "w-full h-32 bg-white rounded-lg cursor-crosshair",
                  }}
                />
              </div>
              <button
                onClick={() => supervisorSigRef.current?.clear()}
                className="mt-2 text-sm text-red-500"
              >
                Hapus TTD
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-600"
              >
                Batal
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
              >
                Setujui Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Item Selection Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                <Search size={22} className="text-blue-500" />
                Daftar Master ATK
              </h3>
              <button onClick={() => setShowItemModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-white sticky top-0 border-b border-slate-50">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Cari nama atau kode barang..."
                  className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
              {itemsWithStock
                .filter(i => 
                  i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((atk) => (
                  <button
                    key={atk.id}
                    onClick={() => selectItem(atk)}
                    className="w-full flex items-center justify-between p-4 hover:bg-blue-50 rounded-2xl text-left transition-all border border-slate-50 hover:border-blue-100 group shadow-sm bg-white"
                  >
                    <div>
                      <div className="font-bold text-slate-800 group-hover:text-blue-700 text-base">{atk.name}</div>
                      <div className="text-xs text-slate-500 mt-1 flex gap-4">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> Kode: {atk.item_code || "-"}</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> Satuan: {atk.unit}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Stok</div>
                      <div className={`font-mono font-bold text-lg ${atk.stock < 5 ? 'text-red-500' : 'text-green-600'}`}>
                        {new Intl.NumberFormat("id-ID").format(atk.stock)}
                      </div>
                    </div>
                  </button>
                ))}
              {itemsWithStock.filter(i => 
                  i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                ).length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                    <Search size={32} className="opacity-20" />
                  </div>
                  <p className="font-medium">Barang tidak ditemukan atau stok kosong</p>
                  <p className="text-xs mt-1">Coba kata kunci lain</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Bank & Ubah Tanda Tangan Pemohon (Khusus Role Admin) */}
      {showRequesterSigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl p-6 border border-slate-200 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Database size={20} className="text-blue-600" />
                  Bank & Ubah Tanda Tangan Pemohon
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pemohon: <span className="font-bold text-slate-800">{users.find(u => u.id === editRequesterId)?.name || requester?.name}</span>
                  {users.find(u => u.id === editRequesterId)?.nip ? ` (${users.find(u => u.id === editRequesterId)?.nip})` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRequesterSigModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigasi Tab */}
            <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveSigTab("bank")}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeSigTab === "bank"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Database size={14} />
                Bank Tanda Tangan ({signatureBank.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSigTab("canvas")}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeSigTab === "canvas"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <PenTool size={14} />
                Goreskan di Kanvas
              </button>
              <button
                type="button"
                onClick={() => setActiveSigTab("upload")}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeSigTab === "upload"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Upload size={14} />
                Upload Gambar
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto pr-1">
              {/* TAB 1: BANK TANDA TANGAN */}
              {activeSigTab === "bank" && (
                <div className="space-y-4">
                  {/* Rekomendasi Sesuai Pemohon Terpilih */}
                  {(() => {
                    const currentU = users.find(u => u.id === editRequesterId);
                    const matched = signatureBank.find(
                      s => (currentU && s.userId === currentU.id) ||
                           (currentU && s.name.toLowerCase() === currentU.name.toLowerCase()) ||
                           (currentU && currentU.nip && s.nip === currentU.nip)
                    );
                    if (!matched) return null;
                    return (
                      <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl shadow-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                            <Sparkles size={12} className="text-amber-500" />
                            Rekomendasi Sesuai Pemohon Terpilih
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">Tersimpan di Database</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-32 h-16 bg-white rounded-xl border border-blue-200 p-1 flex items-center justify-center shrink-0 shadow-inner">
                            <img src={matched.signature} alt={matched.name} className="max-h-full max-w-full object-contain" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-900 text-sm truncate">{matched.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{matched.nip || "Tanpa NIP"}</div>
                            <div className="text-[11px] text-slate-400 truncate">{matched.workUnit || "BPS Kepulauan Seribu"}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditRequesterSignature(matched.signature);
                              setShowRequesterSigModal(false);
                            }}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all shrink-0 flex items-center gap-1.5"
                          >
                            <Check size={14} />
                            Gunakan TTD Ini
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Search bar */}
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-2.5 text-slate-400" size={16} />
                      <input
                        type="text"
                        value={sigSearchQuery}
                        onChange={(e) => setSigSearchQuery(e.target.value)}
                        placeholder="Cari tanda tangan berdasarkan nama / NIP..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Galeri Tanda Tangan */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Daftar Tanda Tangan Pegawai ({signatureBank.length})
                    </div>
                    {signatureBank
                      .filter(s => {
                        const q = sigSearchQuery.toLowerCase();
                        return !q || s.name.toLowerCase().includes(q) || (s.nip && s.nip.includes(q)) || (s.workUnit && s.workUnit.toLowerCase().includes(q));
                      })
                      .map((sig, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-2xl transition-all group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-24 h-14 bg-slate-50 rounded-xl border border-slate-200 p-1 flex items-center justify-center shrink-0 group-hover:bg-white transition-colors">
                              <img src={sig.signature} alt={sig.name} className="max-h-full max-w-full object-contain" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 text-xs truncate group-hover:text-blue-700">{sig.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{sig.nip || "-"}</div>
                              <div className="text-[10px] text-slate-400 truncate">{sig.workUnit || "BPS Kepulauan Seribu"}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditRequesterSignature(sig.signature);
                              setShowRequesterSigModal(false);
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white rounded-xl text-xs font-bold transition-all shrink-0 ml-2"
                          >
                            Pilih TTD
                          </button>
                        </div>
                      ))}

                    {signatureBank.length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        Belum ada data tanda tangan tersimpan di database.
                        <br />
                        Silakan gunakan tab <strong>Goreskan di Kanvas</strong> atau <strong>Upload Gambar</strong>.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: KANVAS */}
              {activeSigTab === "canvas" && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Goreskan Tanda Tangan Baru:
                      </label>
                      <button
                        type="button"
                        onClick={() => requesterSigRef.current?.clear()}
                        className="text-xs text-red-500 hover:text-red-700 font-semibold"
                      >
                        Bersihkan Kanvas
                      </button>
                    </div>
                    <div className="border-2 border-dashed border-blue-300 rounded-2xl p-2 bg-blue-50/50">
                      <SignatureCanvas
                        ref={requesterSigRef}
                        penColor="#1e293b"
                        canvasProps={{
                          className: "w-full h-44 bg-white rounded-xl cursor-crosshair shadow-inner",
                        }}
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={saveToUserBank}
                      onChange={(e) => setSaveToUserBank(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-700 font-medium">
                      Simpan tanda tangan ini ke Bank Tanda Tangan untuk <strong className="text-blue-700">{users.find(u => u.id === editRequesterId)?.name || requester?.name}</strong>
                    </span>
                  </label>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRequesterSigModal(false)}
                      className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 text-sm hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (requesterSigRef.current && !requesterSigRef.current.isEmpty()) {
                          const sigData = requesterSigRef.current.toDataURL();
                          saveNewSignatureToState(sigData);
                        } else {
                          await alert("Silakan tanda tangan di kanvas terlebih dahulu.");
                        }
                      }}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-md transition-colors"
                    >
                      Gunakan Tanda Tangan Ini
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: UPLOAD */}
              {activeSigTab === "upload" && (
                <div className="space-y-4">
                  <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl text-center">
                    <Upload className="mx-auto text-blue-500 mb-2" size={32} />
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pilih Berkas Gambar Tanda Tangan (PNG Transparan / JPG)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-3">Ukuran maksimal disarankan 2MB dengan latar belakang putih/transparan</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const sigData = reader.result as string;
                            saveNewSignatureToState(sigData);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="mx-auto block text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />
                  </div>

                  <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={saveToUserBank}
                      onChange={(e) => setSaveToUserBank(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-700 font-medium">
                      Simpan tanda tangan ini ke Bank Tanda Tangan untuk <strong className="text-blue-700">{users.find(u => u.id === editRequesterId)?.name || requester?.name}</strong>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
