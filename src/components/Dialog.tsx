import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle, HelpCircle, XCircle, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DialogType = "alert" | "success" | "error" | "confirm" | "prompt";

export interface DialogOptions {
  type: DialogType;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;    // only for prompt
  placeholder?: string;     // only for prompt
  destructive?: boolean;    // confirm dengan aksi berbahaya (merah)
}

export interface DialogState extends DialogOptions {
  visible: boolean;
  resolve?: (value: boolean | string | null) => void;
}

interface DialogProps {
  state: DialogState;
  onClose: (result: boolean | string | null) => void;
}

// ─── Icon & colour helpers ────────────────────────────────────────────────────

const iconMap: Record<DialogType, React.ReactNode> = {
  alert:   <AlertCircle  size={24} className="text-blue-500"   />,
  success: <CheckCircle  size={24} className="text-green-500"  />,
  error:   <XCircle      size={24} className="text-red-500"    />,
  confirm: <HelpCircle   size={24} className="text-amber-500"  />,
  prompt:  <AlertCircle  size={24} className="text-blue-500"   />,
};

const confirmBtnClass = (destructive?: boolean) =>
  destructive
    ? "flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-all active:scale-95"
    : "flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all active:scale-95";

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dialog({ state, onClose }: DialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input saat prompt muncul
  useEffect(() => {
    if (state.visible && state.type === "prompt") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state.visible, state.type]);

  // Tutup dengan Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!state.visible) return;
      if (e.key === "Escape") onClose(null);
      if (e.key === "Enter" && state.type !== "prompt") {
        if (state.type === "confirm") onClose(true);
        else onClose(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.visible, state.type, onClose]);

  if (!state.visible) return null;

  const title =
    state.title ??
    (state.type === "success"
      ? "Berhasil"
      : state.type === "error"
      ? "Terjadi Kesalahan"
      : state.type === "confirm"
      ? "Konfirmasi"
      : "Informasi");

  const handleConfirmLabel = state.confirmLabel ?? (state.type === "confirm" ? "Ya, Lanjutkan" : "OK");
  const handleCancelLabel  = state.cancelLabel  ?? "Batal";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(null); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            {iconMap[state.type]}
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
          </div>
          <button
            onClick={() => onClose(null)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-2">
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {state.message}
          </p>

          {state.type === "prompt" && (
            <input
              ref={inputRef}
              type="text"
              defaultValue={state.defaultValue ?? ""}
              placeholder={state.placeholder ?? ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") onClose((e.target as HTMLInputElement).value);
              }}
              className="mt-4 w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none text-sm"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4">
          {/* Tombol batal — hanya untuk confirm & prompt */}
          {(state.type === "confirm" || state.type === "prompt") && (
            <button
              onClick={() => onClose(state.type === "prompt" ? null : false)}
              className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold text-sm transition-all"
            >
              {handleCancelLabel}
            </button>
          )}

          {/* Tombol utama */}
          <button
            onClick={() => {
              if (state.type === "prompt") {
                onClose(inputRef.current?.value ?? "");
              } else if (state.type === "confirm") {
                onClose(true);
              } else {
                onClose(false);
              }
            }}
            className={confirmBtnClass(state.destructive)}
          >
            {handleConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
