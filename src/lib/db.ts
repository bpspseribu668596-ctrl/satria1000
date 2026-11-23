// Types
export interface User { id?: number; nip: string; username: string; name: string; password_hash: string; role: ("admin" | "operator" | "pegawai" | "verifikator" | "penanggungjawab")[]; work_unit: string; signature?: string | null; created_at: string; }
export interface ATKItem { id?: number; item_code: string; name: string; unit: string; created_at: string; }
export interface RequestItem { name: string; quantity: number; unit: string; }
export interface Request {
  id?: number; document_number: string; requester_id: number; items: RequestItem[]; status: string; submission_date: string;
  document_date?: string; book_date?: string;
  submission_location: string;
  fungsi_bagian: string | null; requester_signature: string | null; requester_notes: string | null; verifier_id: number | null;
  verification_date: string | null; verifier_signature: string | null; verification_notes: string | null; supervisor_id: number | null;
  approval_date: string | null; supervisor_signature: string | null; approval_notes: string | null; rejection_reason: string | null; rejected_by: number | null;
  created_at: string; updated_at: string;
}
export interface Settings { id: number; org_name: string; logo_url: string; budget_year: string; doc_format: string; whatsapp_number: string; official_name: string; official_nip: string; official_job: string; address: string; city: string; }
export interface Purchase { id?: number; document_number: string; purchase_date: string; document_date?: string; book_date?: string; vendor_name: string; total_amount: number; receipt_file: string | null; receipt_filename: string | null; notes: string | null; created_by: number; created_at: string; }
export interface PurchaseItem { id?: number; purchase_id: number; item_name: string; quantity: number; unit: string; unit_price: number; total: number; }
export interface ATKRequest { id?: number; document_number: string; requester_id: number; reason: string; reference_link: string | null; fungsi_bagian: string | null; status: "pending" | "approved" | "rejected"; reviewed_by: number | null; reviewed_at: string | null; review_notes: string | null; created_at: string; }
export interface ATKRequestItem { id?: number; request_id: number; item_name: string; category: string; unit: string; quantity: number; is_new_item: boolean; final_item_name: string | null; atk_item_id: number | null; }
export interface InitialBalance { id?: number; item_name: string; unit: string; quantity: number; unit_price: number; year: number; created_at: string; updated_at: string; }
export interface StockOpname { id?: number; item_name: string; unit: string; system_quantity: number; actual_quantity: number; difference: number; month: number; year: number; notes: string | null; created_by: number; created_at: string; updated_at: string; }
export interface TransferMasuk { id?: number; document_number: string; transfer_date: string; document_date?: string; book_date?: string; source_satker: string; total_amount: number; bast_file: string | null; bast_filename: string | null; notes: string | null; created_by: number; created_at: string; }
export interface TransferMasukItem { id?: number; transfer_id: number; item_name: string; quantity: number; unit: string; unit_price: number; total: number; }
export interface TransferKeluar { id?: number; document_number: string; transfer_date: string; document_date?: string; book_date?: string; destination_satker: string; total_amount: number; bast_file: string | null; bast_filename: string | null; notes: string | null; created_by: number; created_at: string; }
export interface TransferKeluarItem { id?: number; transfer_id: number; item_name: string; quantity: number; unit: string; unit_price: number; total: number; }


const getApiBaseUrl = () => {
    // If running in development (localhost UI), hit the local Node process (port 5000)
    // If running in production (satria.bps.go.id), use relative /api
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocalhost ? 'http://localhost:5000/api' : '/api';
};

class ApiTable<T> {
  tableName: string;
  constructor(tableName: string) {
      this.tableName = tableName;
  }

  async toArray(): Promise<T[]> {
    const res = await fetch(`${getApiBaseUrl()}/${this.tableName}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${res.status}`);
    }
    return res.json();
  }

  async get(id: number): Promise<T | undefined> {
    const res = await fetch(`${getApiBaseUrl()}/${this.tableName}/${id}`);
    if (res.status === 404) return undefined;
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${res.status}`);
    }
    return res.json();
  }

  async add(item: T): Promise<number> {
    const res = await fetch(`${getApiBaseUrl()}/${this.tableName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errMsg = `Gagal menyimpan: ${res.status}`;
      try {
        const json = JSON.parse(text);
        if (json.error) errMsg = json.error;
      } catch {
        if (text.includes("<title>")) {
          const match = text.match(/<title>(.*?)<\/title>/i);
          if (match) errMsg += ` (${match[1]})`;
        }
      }
      throw new Error(errMsg);
    }
    const data = await res.json();
    return data.id;
  }

  async update(id: number, changes: Partial<T>): Promise<number> {
    const res = await fetch(`${getApiBaseUrl()}/${this.tableName}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errMsg = `Gagal mengupdate: ${res.status}`;
      try {
        const json = JSON.parse(text);
        if (json.error) errMsg = json.error;
      } catch {
        if (text.includes("<title>")) {
          const match = text.match(/<title>(.*?)<\/title>/i);
          if (match) errMsg += ` (${match[1]})`;
        }
      }
      throw new Error(errMsg);
    }
    const data = await res.json();
    return data.id;
  }

  async bulkAdd(items: T[]): Promise<number> {
    const res = await fetch(`${getApiBaseUrl()}/${this.tableName}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errMsg = `Gagal bulk insert: ${res.status}`;
      try {
        const json = JSON.parse(text);
        if (json.error) errMsg = json.error;
      } catch {
        if (text.includes("<title>")) {
          const match = text.match(/<title>(.*?)<\/title>/i);
          if (match) errMsg += ` (${match[1]})`;
        }
      }
      throw new Error(errMsg);
    }
    const data = await res.json();
    return data.count;
  }

  async delete(id: number): Promise<void> {
    await fetch(`${getApiBaseUrl()}/${this.tableName}/${id}`, {
      method: 'DELETE'
    });
  }

  async count(): Promise<number> {
     const arr = await this.toArray();
     return arr.length;
  }

  reverse() {
    return {
      toArray: async () => {
        const all = await this.toArray();
        return all.reverse();
      }
    };
  }

  where(key: string) {
    const api = this;
    return {
      equals(val: any) {
        return {
          first: async () => {
             const all = await api.toArray();
             return all.find((item: any) => item[key] == val);
          },
          reverse: function() {
            return {
              toArray: async () => {
                const all = await api.toArray();
                return all.filter((item: any) => item[key] == val).reverse();
              }
            };
          },
          delete: async () => {
              const all = await api.toArray();
              const matches = all.filter((item: any) => item[key] == val);
              for (const item of matches) {
                  await api.delete((item as any).id);
              }
          },
          toArray: async () => {
             const all = await api.toArray();
             return all.filter((item: any) => item[key] == val);
          }
        }
      }
    };
  }
  
  orderBy(key: string) {
      const api = this;
      return {
          reverse: () => ({
              toArray: async () => {
                  const all = await api.toArray();
                  return all.sort((a: any, b: any) => {
                      if (typeof a[key] === 'string') return b[key].localeCompare(a[key]);
                      return b[key] - a[key];
                  });
              }
          }),
          toArray: async () => {
              const all = await api.toArray();
              return all.sort((a: any, b: any) => {
                  if (typeof a[key] === 'string') return a[key].localeCompare(b[key]);
                  return a[key] - b[key];
              });
          }
      }
  }
}


class ATKDatabase {
  users = new ApiTable<any>('users');
  atk_items = new ApiTable<any>('atk_items');
  requests = new ApiTable<any>('requests');
  purchases = new ApiTable<any>('purchases');
  purchase_items = new ApiTable<any>('purchase_items');
  atk_requests = new ApiTable<any>('atk_requests');
  atk_request_items = new ApiTable<any>('atk_request_items');
  settings = new ApiTable<any>('settings');
  initial_balances = new ApiTable<any>('initial_balances');
  stock_opnames = new ApiTable<any>('stock_opnames');
  transfer_masuk = new ApiTable<any>('transfer_masuk');
  transfer_masuk_items = new ApiTable<any>('transfer_masuk_items');
  transfer_keluar = new ApiTable<any>('transfer_keluar');
  transfer_keluar_items = new ApiTable<any>('transfer_keluar_items');
}

export const db = new ATKDatabase() as any; 

export async function seedDatabase() {
   // Seed is managed via MySQL directly now
   console.log("Database seed process bypassed (Server-side MySQL now handles it)");
}

export async function hashPassword(password: string): Promise<string> {
  // Passwords verification is handled by the backend during Login
  return password; 
}

export async function checkPassword(_password: string, _hash: string): Promise<boolean> {
  return true; // we verify in AuthContext via backend API call directly
}
