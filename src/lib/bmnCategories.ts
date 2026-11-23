/**
 * Standard BMN Persediaan Sub-Kelompok category mapping for BPS
 */
export const BMN_CATEGORY_MAP: Record<string, string> = {
  "1.01.03.01.001": "ALAT TULIS",
  "1.01.03.01.002": "TINTA TULIS, TINTA STEMPEL",
  "1.01.03.01.003": "PENJEPIT KERTAS",
  "1.01.03.01.004": "PENGHAPUS/KOREKTOR",
  "1.01.03.01.005": "BUKU TULIS",
  "1.01.03.01.006": "MAP DAN ALAT ARSIP",
  "1.01.03.01.007": "PENGGARIS",
  "1.01.03.01.008": "CUTTER & RAUTAN PENSIL",
  "1.01.03.01.009": "PITA MESIN TIK",
  "1.01.03.01.010": "ALAT PEREKAT",
  "1.01.03.01.011": "DOUBLE TAPE & ISI STAPLES",
  "1.01.03.01.012": "STAPLES",
  "1.01.03.01.013": "ISI STAPLES",
  "1.01.03.01.999": "ALAT TULIS KANTOR LAINNYA",
  "1.01.03.02.001": "KERTAS HVS",
  "1.01.03.02.002": "BERBAGAI KERTAS",
  "1.01.03.02.003": "KERTAS COVER",
  "1.01.03.02.004": "AMPLOP",
  "1.01.03.02.005": "KOP SURAT",
  "1.01.03.02.999": "KERTAS DAN COVER LAINNYA",
  "1.01.03.03.002": "TINTA RISOGRAPH",
  "1.01.03.03.004": "MASTER RISOGRAPH",
  "1.01.03.03.999": "BAHAN CETAK LAINNYA",
  "1.01.03.04.001": "CONTINOUS FORM & PAPER TRAY",
  "1.01.03.04.002": "TEMPAT CD",
  "1.01.03.04.003": "PITA PRINTER",
  "1.01.03.04.004": "TINTA PRINTER",
  "1.01.03.04.005": "DISKET & MEDIA PENYIMPANAN",
  "1.01.03.04.006": "USB/FLASH DISK",
  "1.01.03.04.007": "KOMPONEN KOMPUTER",
  "1.01.03.04.010": "MOUSE",
  "1.01.03.04.999": "BAHAN KOMPUTER LAINNYA",
  "1.01.03.05.001": "SAPU & SIKAT",
  "1.01.03.05.002": "PEMBERSIH DEBU & KANEBO",
  "1.01.03.05.003": "GAYUNG & EMBER",
  "1.01.03.05.004": "TEMPAT SAMPAH & PLASTIK",
  "1.01.03.05.006": "TALI RAFIA & KARET",
  "1.01.03.05.008": "PEMBERSIH LANTAI / WC",
  "1.01.03.05.009": "SENDOK & GARPU",
  "1.01.03.05.012": "PENGHARUM RUANGAN & KAMPER",
  "1.01.03.05.999": "PERLENGKAPAN KEBERSIHAN LAINNYA",
  "1.01.03.06.001": "KABEL LISTRIK",
  "1.01.03.06.003": "HUB & PERANGKAT LISTRIK",
  "1.01.03.06.010": "BATU BATERAI",
  "1.01.03.06.999": "ALAT PENUNJANG KEGIATAN KANTOR LAINNYA",
  "1.01.03.07.006": "MAINTENANCE BOX",
  "1.01.03.07.007": "BOKS ARSIP & TAS",
  "1.01.03.09.999": "KABEL AUDIO & SOUND",
  "1.01.03.10.999": "BOX ARSIP LAINNYA",
  "1.01.03.99.999": "BARANG PERSEDIAAN LAINNYA",
  "1.01.05.01.001": "MATERAI",
  "1.01.05.01.008": "PUBLIKASI & CETAKAN STATISTIK",
};

export function getCategoryFromItemCode(itemCode?: string): { categoryCode: string; categoryName: string; shortCode: string } {
  if (!itemCode) {
    return { categoryCode: "9.99.99.99.999", categoryName: "LAIN-LAIN", shortCode: "-" };
  }

  const parts = itemCode.trim().split(".");
  let categoryCode = "1.01.03.99.999";
  let shortCode = itemCode;

  if (parts.length >= 6) {
    categoryCode = parts.slice(0, 5).join(".");
    shortCode = parts.slice(5).join(".");
  } else if (parts.length === 5) {
    categoryCode = parts.join(".");
  }

  const categoryName = BMN_CATEGORY_MAP[categoryCode] || `KELOMPOK ${categoryCode}`;

  return {
    categoryCode,
    categoryName,
    shortCode,
  };
}
