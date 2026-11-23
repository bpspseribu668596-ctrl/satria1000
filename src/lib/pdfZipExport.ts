import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import QRCode from "qrcode";
import type { Request, User, Settings } from "./db";

// Helper konversi URL/file ke Base64 data URL
export async function urlToBase64(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

// Format Tanggal Indonesia
export const formatIndoDate = (dateStr?: string | null) => {
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

// Ambil display nama Verifikator
export const getVerifierDisplay = (req: Request, users: User[]) => {
  if (req.verification_notes) {
    const match = req.verification_notes.match(/^(.+?) \((.+?)\)/);
    if (match) return { name: match[1], nip: match[2] };
  }
  const u = users.find((usr) => usr.id === req.verifier_id);
  return u ? { name: u.name, nip: u.nip || "" } : null;
};

// Ambil display nama Penanggung Jawab
export const getApproverDisplay = (req: Request, users: User[], settings: Settings | null) => {
  if (req.approval_notes) {
    const match = req.approval_notes.match(/^(.+?) \((.+?)\)/);
    if (match) return { name: match[1], nip: match[2] };
  }
  const u = users.find((usr) => usr.id === req.supervisor_id);
  if (u) return { name: u.name, nip: u.nip || "" };
  return settings?.official_name ? { name: settings.official_name, nip: settings.official_nip || "" } : null;
};

// Format nama file yang aman untuk semua OS (mengganti / dengan _)
export const getSafeFileName = (docNumber?: string | null, id?: number) => {
  const base = docNumber && docNumber.trim() ? docNumber.trim() : `DOK_${id || Date.now()}`;
  return base.replace(/[\/\\:*?"<>|]/g, "_") + ".pdf";
};

// Bangun elemen HTML resmi untuk 1 permintaan
export function buildRequestHtml(
  req: Request,
  users: User[],
  settings: Settings | null,
  logoBase64: string,
  qrCodeDataUrl: string
): HTMLElement {
  const requester = users.find((u) => u.id === req.requester_id);
  const verifierInfo = getVerifierDisplay(req, users);
  const approverInfo = getApproverDisplay(req, users, settings);

  const container = document.createElement("div");
  container.style.width = "794px"; // Standard A4 width at 96 DPI
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#000000";
  container.style.fontFamily = "Arial, sans-serif";
  container.style.fontSize = "11px";
  container.style.lineHeight = "1.35";
  container.style.padding = "24px 30px";
  container.style.boxSizing = "border-box";

  // 1. KOP SURAT
  const kop = document.createElement("div");
  kop.style.display = "flex";
  kop.style.alignItems = "center";
  kop.style.gap = "12px";
  kop.style.paddingBottom = "6px";
  kop.style.borderBottom = "2px solid #000000";

  const logoImg = document.createElement("img");
  logoImg.src = logoBase64 || "/bpslogo.svg";
  logoImg.style.width = "54px";
  logoImg.style.height = "54px";
  logoImg.style.objectFit = "contain";
  kop.appendChild(logoImg);

  const kopText = document.createElement("div");
  kopText.style.flex = "1";
  kopText.style.textAlign = "center";
  kopText.innerHTML = `
    <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
      ${settings?.org_name || "BADAN PUSAT STATISTIK KOTA JAKARTA SELATAN"}
    </div>
    <div style="font-size: 13px; font-weight: 900; text-transform: uppercase; margin-top: 2px;">
      FORMULIR PERMINTAAN ALAT TULIS KANTOR (ATK)
    </div>
    <div style="font-size: 9.5px; font-weight: 500; color: #333333; margin-top: 2px;">
      Tahun Anggaran ${settings?.budget_year || new Date().getFullYear()} ${settings?.address ? "• " + settings.address : ""} ${settings?.city ? ", " + settings.city : ""}
    </div>
  `;
  kop.appendChild(kopText);

  const emptyPlaceholder = document.createElement("div");
  emptyPlaceholder.style.width = "54px";
  kop.appendChild(emptyPlaceholder);

  container.appendChild(kop);

  // Garis ganda kop
  const doubleLine = document.createElement("div");
  doubleLine.style.borderBottom = "1px solid #000000";
  doubleLine.style.marginTop = "2px";
  doubleLine.style.marginBottom = "10px";
  container.appendChild(doubleLine);

  // 2. TABEL IDENTITAS & TANGGAL SAKTI
  const metaTable = document.createElement("table");
  metaTable.style.width = "100%";
  metaTable.style.fontSize = "10.5px";
  metaTable.style.marginBottom = "10px";
  metaTable.style.borderCollapse = "collapse";

  metaTable.innerHTML = `
    <tbody>
      <tr>
        <td style="width: 125px; padding: 2px 0; font-weight: 600; color: #1e293b;">Nomor Dokumen</td>
        <td style="width: 12px; padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0; font-weight: bold; font-family: monospace;">${req.document_number || "-"}</td>

        <td style="width: 135px; padding: 2px 0; font-weight: 600; color: #1e293b;">Tanggal Dokumen</td>
        <td style="width: 12px; padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0; font-weight: 600;">${formatIndoDate(req.document_date || req.submission_date)}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0; font-weight: 600; color: #1e293b;">Nama Pemohon</td>
        <td style="padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0; font-weight: bold;">${requester?.name || "Unknown"}</td>

        <td style="padding: 2px 0; font-weight: 600; color: #1e293b;">Tanggal Buku (SAKTI)</td>
        <td style="padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0; font-weight: 600;">${formatIndoDate(req.book_date || req.submission_date)}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0; font-weight: 600; color: #1e293b;">NIP Pemohon</td>
        <td style="padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0; font-family: monospace;">${requester?.nip ? `NIP. ${requester.nip}` : "-"}</td>

        <td style="padding: 2px 0; font-weight: 600; color: #1e293b;">Fungsi / Bagian</td>
        <td style="padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0; font-weight: 600;">${req.fungsi_bagian || requester?.work_unit || "-"}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0; font-weight: 600; color: #1e293b;">Lokasi Pengajuan</td>
        <td style="padding: 2px 0; text-align: center; font-weight: bold;">:</td>
        <td style="padding: 2px 0;" colspan="4">${req.submission_location || "Jakarta Selatan"}</td>
      </tr>
    </tbody>
  `;
  container.appendChild(metaTable);

  // 3. TABEL DAFTAR BARANG YANG DIMINTA
  const itemSection = document.createElement("div");
  itemSection.style.marginBottom = "10px";

  const itemTitle = document.createElement("div");
  itemTitle.style.fontSize = "10.5px";
  itemTitle.style.fontWeight = "bold";
  itemTitle.style.textTransform = "uppercase";
  itemTitle.style.marginBottom = "4px";
  itemTitle.textContent = "Daftar Barang yang Diminta:";
  itemSection.appendChild(itemTitle);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.fontSize = "10.5px";
  table.style.border = "1px solid #000000";
  table.style.borderCollapse = "collapse";

  let itemsHtml = `
    <thead>
      <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000000;">
        <th style="border-right: 1px solid #000000; padding: 4px 6px; text-align: center; width: 35px; font-weight: bold;">NO</th>
        <th style="border-right: 1px solid #000000; padding: 4px 8px; text-align: left; font-weight: bold;">NAMA BARANG / SPESIFIKASI</th>
        <th style="border-right: 1px solid #000000; padding: 4px 8px; text-align: center; width: 80px; font-weight: bold;">JUMLAH</th>
        <th style="padding: 4px 8px; text-align: center; width: 80px; font-weight: bold;">SATUAN</th>
      </tr>
    </thead>
    <tbody>
  `;

  (req.items || []).forEach((item, idx) => {
    itemsHtml += `
      <tr style="border-bottom: 1px solid #000000;">
        <td style="border-right: 1px solid #000000; padding: 4px 6px; text-align: center;">${idx + 1}</td>
        <td style="border-right: 1px solid #000000; padding: 4px 8px; font-weight: 600;">${item.name}</td>
        <td style="border-right: 1px solid #000000; padding: 4px 8px; text-align: center; font-weight: bold;">${item.quantity}</td>
        <td style="padding: 4px 8px; text-align: center;">${item.unit}</td>
      </tr>
    `;
  });

  itemsHtml += "</tbody>";
  table.innerHTML = itemsHtml;
  itemSection.appendChild(table);
  container.appendChild(itemSection);

  // 4. BLOK TANDA TANGAN
  const sigSection = document.createElement("div");
  sigSection.style.marginTop = "12px";

  const locationDate = document.createElement("div");
  locationDate.style.textAlign = "right";
  locationDate.style.fontSize = "10.5px";
  locationDate.style.marginBottom = "6px";
  locationDate.style.fontWeight = "500";
  locationDate.textContent = `${req.submission_location || "Jakarta Selatan"}, ${formatIndoDate(req.document_date || req.submission_date)}`;
  sigSection.appendChild(locationDate);

  const sigGrid = document.createElement("div");
  sigGrid.style.display = "grid";
  sigGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
  sigGrid.style.gap = "12px";
  sigGrid.style.textAlign = "center";
  sigGrid.style.fontSize = "10px";

  // Kolom 1: Pemohon
  sigGrid.innerHTML += `
    <div style="display: flex; flex-direction: column; justify-content: space-between; height: 110px;">
      <div>
        <div style="font-weight: bold; font-size: 10.5px;">Pemohon,</div>
        <div style="font-size: 9px; color: #475569;">${req.fungsi_bagian || "Pegawai"}</div>
      </div>
      <div style="margin: auto 0; display: flex; align-items: center; justify-content: center; height: 50px;">
        ${req.requester_signature ? `<img src="${req.requester_signature}" style="max-height: 48px; max-width: 100%; object-fit: contain;" />` : `<span style="color: #94a3b8; font-style: italic; font-size: 9px;">(Tanda Tangan Digital)</span>`}
      </div>
      <div>
        <div style="font-weight: bold; text-decoration: underline; font-size: 10.5px;">${requester?.name || "Unknown"}</div>
        <div style="font-size: 9px; color: #334155;">${requester?.nip ? `NIP. ${requester.nip}` : "-"}</div>
      </div>
    </div>
  `;

  // Kolom 2: Verifikator
  sigGrid.innerHTML += `
    <div style="display: flex; flex-direction: column; justify-content: space-between; height: 110px;">
      <div>
        <div style="font-weight: bold; font-size: 10.5px;">Diverifikasi Oleh,</div>
        <div style="font-size: 9px; color: #475569;">Pengelola Barang Persediaan</div>
      </div>
      <div style="margin: auto 0; display: flex; align-items: center; justify-content: center; height: 50px;">
        ${req.verifier_signature ? `<img src="${req.verifier_signature}" style="max-height: 48px; max-width: 100%; object-fit: contain;" />` : `<span style="color: #94a3b8; font-style: italic; font-size: 9px;">(Tanda Tangan Digital)</span>`}
      </div>
      <div>
        <div style="font-weight: bold; text-decoration: underline; font-size: 10.5px;">${verifierInfo ? verifierInfo.name : "-"}</div>
        <div style="font-size: 9px; color: #334155;">${verifierInfo?.nip ? `NIP. ${verifierInfo.nip}` : "-"}</div>
      </div>
    </div>
  `;

  // Kolom 3: Penanggung Jawab
  sigGrid.innerHTML += `
    <div style="display: flex; flex-direction: column; justify-content: space-between; height: 110px;">
      <div>
        <div style="font-weight: bold; font-size: 10.5px;">Menyetujui,</div>
        <div style="font-size: 9px; color: #475569;">${settings?.official_job && settings.official_job !== "Pejabat Pembuat Komitmen" ? settings.official_job : "Kepala Subbagian Umum"}</div>
      </div>
      <div style="margin: auto 0; display: flex; align-items: center; justify-content: center; height: 50px;">
        ${req.supervisor_signature ? `<img src="${req.supervisor_signature}" style="max-height: 48px; max-width: 100%; object-fit: contain;" />` : `<span style="color: #94a3b8; font-style: italic; font-size: 9px;">(Tanda Tangan Digital)</span>`}
      </div>
      <div>
        <div style="font-weight: bold; text-decoration: underline; font-size: 10.5px;">${approverInfo ? approverInfo.name : "-"}</div>
        <div style="font-size: 9px; color: #334155;">${approverInfo?.nip ? `NIP. ${approverInfo.nip}` : "-"}</div>
      </div>
    </div>
  `;

  sigSection.appendChild(sigGrid);
  container.appendChild(sigSection);

  // 5. FOOTNOTE KEABSAHAN ELEKTRONIK & QR CODE
  const footnote = document.createElement("div");
  footnote.style.marginTop = "14px";
  footnote.style.paddingTop = "8px";
  footnote.style.borderTop = "1px solid #000000";
  footnote.style.display = "flex";
  footnote.style.alignItems = "center";
  footnote.style.justifyContent = "space-between";
  footnote.style.fontSize = "8px";
  footnote.style.color = "#1e293b";

  footnote.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div style="border: 1px solid #000000; padding: 2px; background-color: #ffffff; flex-shrink: 0;">
        <img src="${qrCodeDataUrl}" style="width: 44px; height: 44px; object-fit: contain; display: block;" />
      </div>
      <div style="line-height: 1.25;">
        <div style="font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #000000;">
          Verifikasi Keabsahan Naskah Dinas Elektronik • SATRIA BPS Kota Jakarta Selatan
        </div>
        <div style="color: #475569; font-size: 7.5px;">
          Dokumen ini sah dan diterbitkan secara elektronik melalui Sistem SATRIA ATK.
        </div>
        <div style="font-size: 7.5px;">
          Pindai QR Code di samping atau akses tautan verifikasi:
          <span style="font-family: monospace; font-weight: bold; color: #1e3a8a; text-decoration: underline;">
            ${window.location.origin}/verify/request/${req.id}
          </span>
        </div>
      </div>
    </div>
    <div style="text-align: right; font-family: monospace; font-size: 7px; color: #64748b; flex-shrink: 0;">
      <div>SISTEM SATRIA</div>
      <div>BPS JAKARTA SELATAN</div>
    </div>
  `;
  container.appendChild(footnote);

  return container;
}

// Generate single PDF Blob
export async function generateSingleRequestPdfBlob(
  req: Request,
  users: User[],
  settings: Settings | null,
  logoBase64: string
): Promise<Blob> {
  const verifyUrl = `${window.location.origin}/verify/request/${req.id}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 100,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const domNode = buildRequestHtml(req, users, settings, logoBase64, qrCodeDataUrl);

  // Hidden container on body
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "-9999px";
  wrapper.style.zIndex = "-1000";
  wrapper.appendChild(domNode);
  document.body.appendChild(wrapper);

  try {
    // Wait for microtask/paint
    await new Promise((resolve) => setTimeout(resolve, 60));

    const canvas = await html2canvas(domNode, {
      scale: 2, // Sharp high DPI print
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210; // A4 width in mm
    const pageHeight = (canvas.height * pageWidth) / canvas.width;

    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, Math.min(pageHeight, 297));
    return pdf.output("blob");
  } finally {
    document.body.removeChild(wrapper);
  }
}

// Batch ZIP Downloader
export async function downloadRequestsZip(
  requestsToExport: Request[],
  users: User[],
  settings: Settings | null,
  dateFromStr: string,
  dateToStr: string,
  onProgress: (current: number, total: number, currentName: string) => void
): Promise<void> {
  if (requestsToExport.length === 0) {
    throw new Error("Tidak ada dokumen permintaan yang dipilih untuk diunduh.");
  }

  // Pre-fetch logo BPS as DataURL once
  const logoUrl = settings?.logo_url || "/bpslogo.svg";
  const logoBase64 = await urlToBase64(logoUrl);

  const zip = new JSZip();
  const total = requestsToExport.length;

  for (let i = 0; i < total; i++) {
    const req = requestsToExport[i];
    const fileName = getSafeFileName(req.document_number, req.id);
    onProgress(i + 1, total, fileName);

    const pdfBlob = await generateSingleRequestPdfBlob(req, users, settings, logoBase64);
    zip.file(fileName, pdfBlob);

    // Yield to main thread briefly for smooth UI progress
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  onProgress(total, total, "Mengompres file arsip ZIP...");
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipFileName = `Arsip_Permintaan_ATK_${dateFromStr}_sd_${dateToStr}.zip`;
  const downloadUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
