/**
 * Stock & Inventory Valuation Utilities (FIFO Engine)
 * Synchronized across Kartu Kendali, Public QR Verification, and Laporan Persediaan (SAKTI)
 */

export interface RawStockTx {
  date: string;
  docDate: string;
  noDoc: string;
  keterangan: string;
  unit: number;
  harga: number;
  jumlah: number;
  type: "masuk" | "keluar";
}

export interface CalculatedStockTx {
  no: number;
  date: string;
  docDate?: string;
  keterangan: string;
  noDoc: string;
  masukUnit: number;
  masukHarga: number;
  masukJumlah: number;
  keluarUnit: number;
  keluarHarga: number;
  keluarJumlah: number;
  saldoUnit: number;
  saldoHarga: number;
  saldoJumlah: number;
  isSaldoRow?: boolean;
}

export interface StockBatch {
  quantity: number;
  price: number;
}

export interface InventoryTxItem {
  date: string;
  type: "IN" | "OUT";
  qty: number;
  price: number;
}

export interface FifoInventorySummary {
  mutasiMasukQty: number;
  mutasiKeluarQty: number;
  mutasiBersihQty: number;
  saldoAkhirQty: number;
  saldoAkhirNilai: number;
}

/**
 * Normalizes date string to YYYY-MM-DD
 */
export function normalizeDate(d?: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
}

/**
 * Process stock transactions for Kartu Kendali (FIFO)
 * Ensures:
 * 1. Same-day transactions prioritize "masuk" before "keluar"
 * 2. Deficits (out-of-order disbursements) are absorbed when incoming batches arrive
 * 3. Total valuation is strictly tied to active batches: when runningUnit <= 0, runningJumlah = 0
 */
export function processFifoTransactions(
  allTx: RawStockTx[],
  initialBalance?: { quantity?: number; unit_price?: number } | null,
  dateFrom?: string
): CalculatedStockTx[] {
  const txList: CalculatedStockTx[] = [];
  let runningUnit = 0;
  let runningJumlah = 0;
  let rowNo = 1;

  const batches: StockBatch[] = [];

  const initQty = Number(initialBalance?.quantity) || 0;
  const initPrice = Number(initialBalance?.unit_price) || 0;

  if (initQty > 0) {
    batches.push({
      quantity: initQty,
      price: initPrice,
    });
    runningUnit = initQty;
    runningJumlah = initQty * initPrice;
  }

  // Row 1: Saldo Awal
  txList.push({
    no: rowNo++,
    date: dateFrom || "",
    docDate: dateFrom || "",
    keterangan: `Saldo Awal ${
      dateFrom
        ? new Date(dateFrom).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          })
        : ""
    }`,
    noDoc: "",
    masukUnit: initQty,
    masukHarga: initPrice,
    masukJumlah: initQty * initPrice,
    keluarUnit: 0,
    keluarHarga: 0,
    keluarJumlah: 0,
    saldoUnit: runningUnit,
    saldoHarga: batches.length > 0 ? batches[0].price : 0,
    saldoJumlah: runningJumlah,
  });

  // Intermediate Saldo Row
  txList.push({
    no: 0,
    date: "",
    docDate: "",
    keterangan: "Saldo",
    noDoc: "",
    masukUnit: 0,
    masukHarga: 0,
    masukJumlah: 0,
    keluarUnit: 0,
    keluarHarga: 0,
    keluarJumlah: 0,
    saldoUnit: runningUnit,
    saldoHarga: batches.length > 0 ? batches[0].price : 0,
    saldoJumlah: runningJumlah,
    isSaldoRow: true,
  });

  // Determine fallback unit price for the item
  const fallbackPrice =
    initPrice > 0
      ? initPrice
      : (allTx.find((t) => t.type === "masuk" && Number(t.harga) > 0)?.harga || 0);

  let lastKnownPrice = fallbackPrice;
  if (batches.length > 0) {
    lastKnownPrice = batches[0].price;
  }

  // Sort chronological: date ASC, then "masuk" before "keluar" on the same date
  const sortedTx = [...allTx].sort((a, b) => {
    const dA = normalizeDate(a.date);
    const dB = normalizeDate(b.date);
    const cmp = dA.localeCompare(dB);
    if (cmp !== 0) return cmp;
    if (a.type === "masuk" && b.type === "keluar") return -1;
    if (a.type === "keluar" && b.type === "masuk") return 1;
    return 0;
  });

  for (const tx of sortedTx) {
    if (tx.type === "masuk") {
      if (tx.harga > 0) {
        lastKnownPrice = tx.harga;
      }

      let netIncomingQty = tx.unit;
      // If there was a deficit (runningUnit < 0), the incoming batch absorbs the deficit
      if (runningUnit < 0) {
        const deficit = Math.abs(runningUnit);
        const absorbed = Math.min(deficit, netIncomingQty);
        netIncomingQty -= absorbed;
      }

      if (netIncomingQty > 0) {
        batches.push({ quantity: netIncomingQty, price: tx.harga });
      }

      runningUnit += tx.unit;
      if (Math.abs(runningUnit) < 0.0001) runningUnit = 0;

      if (runningUnit <= 0) {
        runningJumlah = 0;
        batches.length = 0;
      } else {
        runningJumlah = batches.reduce((sum, b) => sum + b.quantity * b.price, 0);
      }
      if (Math.abs(runningJumlah) < 0.01) runningJumlah = 0;

      const currentPrice = runningUnit > 0
        ? (batches.length > 0 ? batches[0].price : lastKnownPrice)
        : 0;

      txList.push({
        no: rowNo++,
        date: tx.date,
        docDate: tx.docDate || tx.date,
        keterangan: tx.keterangan,
        noDoc: tx.noDoc,
        masukUnit: tx.unit,
        masukHarga: tx.harga,
        masukJumlah: tx.jumlah,
        keluarUnit: 0,
        keluarHarga: 0,
        keluarJumlah: 0,
        saldoUnit: runningUnit,
        saldoHarga: currentPrice,
        saldoJumlah: runningJumlah,
      });
    } else {
      // tx.type === "keluar"
      let qtyToDeduct = tx.unit;
      let totalCost = 0;
      const priceForThisTx = batches.length > 0 ? batches[0].price : lastKnownPrice;

      while (qtyToDeduct > 0 && batches.length > 0) {
        const currentBatch = batches[0];
        const canTake = Math.min(currentBatch.quantity, qtyToDeduct);
        totalCost += canTake * currentBatch.price;
        currentBatch.quantity -= canTake;
        qtyToDeduct -= canTake;
        if (currentBatch.quantity <= 0) batches.shift();
      }

      if (qtyToDeduct > 0) {
        totalCost += qtyToDeduct * priceForThisTx;
      }

      runningUnit -= tx.unit;
      if (Math.abs(runningUnit) < 0.0001) runningUnit = 0;

      if (runningUnit <= 0) {
        runningJumlah = 0;
        batches.length = 0;
      } else {
        runningJumlah = batches.reduce((sum, b) => sum + b.quantity * b.price, 0);
      }
      if (Math.abs(runningJumlah) < 0.01) runningJumlah = 0;

      const currentPrice = runningUnit > 0
        ? (batches.length > 0 ? batches[0].price : lastKnownPrice)
        : 0;

      txList.push({
        no: rowNo++,
        date: tx.date,
        docDate: tx.docDate || tx.date,
        keterangan: tx.keterangan,
        noDoc: tx.noDoc,
        masukUnit: 0,
        masukHarga: 0,
        masukJumlah: 0,
        keluarUnit: tx.unit,
        keluarHarga: priceForThisTx,
        keluarJumlah: totalCost,
        saldoUnit: runningUnit,
        saldoHarga: currentPrice,
        saldoJumlah: runningJumlah,
      });
    }

    const currentPrice = runningUnit > 0
      ? (batches.length > 0 ? batches[0].price : lastKnownPrice)
      : 0;

    txList.push({
      no: 0,
      date: "",
      docDate: "",
      keterangan: "Saldo",
      noDoc: "",
      masukUnit: 0,
      masukHarga: 0,
      masukJumlah: 0,
      keluarUnit: 0,
      keluarHarga: 0,
      keluarJumlah: 0,
      saldoUnit: runningUnit,
      saldoHarga: currentPrice,
      saldoJumlah: runningJumlah,
      isSaldoRow: true,
    });
  }

  return txList;
}

/**
 * Calculates FIFO summary for Laporan Persediaan (SAKTI format)
 */
export function calculateInventoryFifoSummary(
  txs: InventoryTxItem[],
  saldoAwalQty: number,
  saldoAwalPrice: number
): FifoInventorySummary {
  const batches: StockBatch[] = [];
  if (saldoAwalQty > 0) {
    batches.push({ quantity: saldoAwalQty, price: saldoAwalPrice });
  }

  // Sort chronological: date ASC, then IN before OUT
  const sortedTxs = [...txs].sort((a, b) => {
    const dA = normalizeDate(a.date);
    const dB = normalizeDate(b.date);
    const cmp = dA.localeCompare(dB);
    if (cmp !== 0) return cmp;
    if (a.type === "IN" && b.type === "OUT") return -1;
    if (a.type === "OUT" && b.type === "IN") return 1;
    return 0;
  });

  let mutasiMasukQty = 0;
  let mutasiKeluarQty = 0;
  let runningQty = saldoAwalQty;

  for (const tx of sortedTxs) {
    if (tx.type === "IN") {
      mutasiMasukQty += tx.qty;
      let netInQty = tx.qty;
      if (runningQty < 0) {
        const deficit = Math.abs(runningQty);
        const absorbed = Math.min(deficit, netInQty);
        netInQty -= absorbed;
      }
      if (netInQty > 0) {
        batches.push({ quantity: netInQty, price: tx.price });
      }
      runningQty += tx.qty;
    } else {
      mutasiKeluarQty += tx.qty;
      let rem = tx.qty;
      while (rem > 0 && batches.length > 0) {
        const b = batches[0];
        const take = Math.min(b.quantity, rem);
        b.quantity -= take;
        rem -= take;
        if (b.quantity <= 0) batches.shift();
      }
      runningQty -= tx.qty;
      if (runningQty <= 0) {
        batches.length = 0;
      }
    }
  }

  const mutasiBersihQty = mutasiMasukQty - mutasiKeluarQty;
  let saldoAkhirQty = saldoAwalQty + mutasiBersihQty;
  if (Math.abs(saldoAkhirQty) < 0.0001) saldoAkhirQty = 0;

  const saldoAkhirNilai = saldoAkhirQty > 0
    ? batches.reduce((sum, b) => sum + b.quantity * b.price, 0)
    : 0;

  return {
    mutasiMasukQty,
    mutasiKeluarQty,
    mutasiBersihQty,
    saldoAkhirQty: Math.max(0, saldoAkhirQty),
    saldoAkhirNilai: Math.max(0, saldoAkhirNilai),
  };
}
