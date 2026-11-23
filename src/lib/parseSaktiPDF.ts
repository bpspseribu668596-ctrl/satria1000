import * as pdfjsLib from "pdfjs-dist";

// Use unpkg CDN for the worker (better CORS support)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface ParsedPurchaseItem {
  document_number: string;
  document_date: string;
  book_date: string;
  item_code: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

/**
 * Parse SAKTI PDF and extract purchase data
 */
export async function parseSaktiPDF(file: File): Promise<ParsedPurchaseItem[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const items: ParsedPurchaseItem[] = [];

  // Collect all text from all pages
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Extract text items with their positions
    const textItems = textContent.items
      .filter((item) => "str" in item && "transform" in item)
      .map((item) => {
        const typedItem = item as { str: string; transform: number[] };
        return {
          text: typedItem.str,
          x: typedItem.transform[4],
          y: typedItem.transform[5],
        };
      });

    // Group by Y position to form lines
    const rows = groupByRows(textItems);

    // Combine into lines
    for (const row of rows) {
      const lineText = row.map((r) => r.text).join(" ");
      fullText += lineText + "\n";
    }
  }

  console.log("Extracted PDF text:", fullText);

  // Parse using line-by-line approach
  const lines = fullText.split("\n");

  for (const line of lines) {
    const parsed = parseLineFlexible(line);
    if (parsed) {
      items.push(parsed);
    }
  }

  return items;
}

interface TextItem {
  text: string;
  x: number;
  y: number;
}

/**
 * Group text items by their Y position (rows)
 */
function groupByRows(items: TextItem[]): TextItem[][] {
  const tolerance = 3;
  const rows: TextItem[][] = [];

  if (items.length === 0) return rows;

  // Sort by Y (descending - PDF coordinates)
  const sorted = [...items].sort((a, b) => b.y - a.y);

  let currentRow: TextItem[] = [];
  let currentY = sorted[0].y;

  for (const item of sorted) {
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
    } else {
      if (currentRow.length > 0) {
        rows.push(currentRow.sort((a, b) => a.x - b.x));
      }
      currentRow = [item];
      currentY = item.y;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.x - b.x));
  }

  return rows;
}

/**
 * Parse a line flexibly looking for SAKTI purchase data
 */
function parseLineFlexible(line: string): ParsedPurchaseItem | null {
  // Skip headers and summary lines
  if (
    line.includes("NOMOR DOKUMEN") ||
    line.includes("JUMLAH PERSEDIAAN") ||
    line.includes("KODE UAKPB") ||
    line.includes("UAKPB") ||
    line.includes("Halaman") ||
    line.includes("TGL DOK") ||
    line.includes("TGL BUKU") ||
    line.trim().length < 20
  ) {
    return null;
  }

  // Document number pattern: starts with 0, contains digits and letters like KD
  // Example: 054010100539163000KD202500002M
  const docNumberMatch = line.match(/\b(0\d{10,}[A-Z]{1,3}\d+[A-Z]?)\b/);
  if (!docNumberMatch) return null;

  const docNumber = docNumberMatch[1];

  // Date pattern: DD-MM-YYYY
  const dateMatches = line.match(/\b(\d{2}-\d{2}-\d{4})\b/g) || [];
  const docDate = dateMatches[0] || "";
  const bookDate = dateMatches[1] || dateMatches[0] || "";

  // Item code pattern: X.XX.XX.XX.XXX.XXXXXX
  const codeMatch = line.match(/\b(\d+\.\d+\.\d+\.\d+\.\d+\.\d+)\b/);
  const itemCode = codeMatch ? codeMatch[1] : "";

  // Extract item name - text between code and numbers
  let itemName = "";

  if (itemCode) {
    // Find text after item code
    const codeIndex = line.indexOf(itemCode);
    const afterCode = line.substring(codeIndex + itemCode.length);

    // Item name is typically letters and spaces before the numbers
    const nameMatch = afterCode.match(
      /^\s*([A-Za-z][A-Za-z0-9\s\-\.]+?)(?=\s+\d)/,
    );
    if (nameMatch) {
      itemName = nameMatch[1].trim();
    }
  }

  // Extract numbers - look for numeric values
  // Numbers may have comma/dot as thousand separator
  const numberStrings = line.match(/\b[\d,\.]+\b/g) || [];
  const numbers: number[] = [];

  for (const numStr of numberStrings) {
    // Skip dates
    if (/^\d{2}-\d{2}-\d{4}$/.test(numStr)) continue;
    // Skip item codes
    if (/^\d+\.\d+\.\d+\.\d+\.\d+\.\d+$/.test(numStr)) continue;

    // Parse number (remove thousand separators)
    const cleaned = numStr.replace(/[.,]/g, "");
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num > 0) {
      numbers.push(num);
    }
  }

  // Typically last 3 numbers are: quantity, unit_price, total
  let quantity = 0;
  let unitPrice = 0;
  let total = 0;

  if (numbers.length >= 3) {
    quantity = numbers[numbers.length - 3];
    unitPrice = numbers[numbers.length - 2];
    total = numbers[numbers.length - 1];
  } else if (numbers.length === 2) {
    quantity = 1;
    unitPrice = numbers[0];
    total = numbers[1];
  } else if (numbers.length === 1) {
    total = numbers[0];
    quantity = 1;
    unitPrice = total;
  }

  // If we still don't have item name, try alternative extraction
  if (!itemName && itemCode) {
    // Get everything between code and numbers at end
    const parts = line.split(itemCode);
    if (parts.length > 1) {
      const afterPart = parts[1];
      // Remove numbers from end
      const withoutNumbers = afterPart.replace(/[\d,\.]+\s*$/g, "").trim();
      // Take first reasonable chunk
      const words = withoutNumbers
        .split(/\s+/)
        .filter((w) => w.length > 1 && !/^\d+$/.test(w));
      itemName = words.slice(0, 6).join(" ");
    }
  }

  // Validate minimum required data
  if (!docNumber || quantity === 0) {
    return null;
  }

  // If no item name found, use a placeholder with item code
  if (!itemName) {
    itemName = itemCode ? `Item ${itemCode}` : "Unknown Item";
  }

  console.log("Parsed item:", {
    docNumber,
    docDate,
    itemCode,
    itemName,
    quantity,
    unitPrice,
    total,
  });

  return {
    document_number: docNumber,
    document_date: docDate,
    book_date: bookDate,
    item_code: itemCode,
    item_name: itemName,
    quantity,
    unit_price: unitPrice,
    total,
  };
}

/**
 * Generate unique batch ID for import
 */
export function generateBatchId(): string {
  return `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}
