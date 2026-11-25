import { useState, useCallback } from "react";
import type { DialogState, DialogOptions } from "../components/Dialog";

const DEFAULT_STATE: DialogState = {
  visible: false,
  type: "alert",
  message: "",
};

/**
 * Hook untuk menampilkan dialog kustom sebagai pengganti alert/confirm/prompt bawaan browser.
 *
 * Usage:
 *   const { dialogState, closeDialog, alert, confirm, prompt } = useDialog();
 *   // tambahkan <Dialog state={dialogState} onClose={closeDialog} /> di JSX
 *
 *   await alert("Berhasil disimpan!");
 *   const ok = await confirm("Yakin hapus?");
 *   const val = await prompt("Masukkan alasan:", { placeholder: "..." });
 */
export function useDialog() {
  const [dialogState, setDialogState] = useState<DialogState>(DEFAULT_STATE);

  const closeDialog = useCallback((result: boolean | string | null) => {
    setDialogState((prev) => {
      prev.resolve?.(result);
      return { ...prev, visible: false };
    });
  }, []);

  /** Pengganti alert() — satu tombol OK */
  const alert = useCallback(
    (message: string, options?: Partial<Omit<DialogOptions, "type" | "message">>) =>
      new Promise<void>((resolve) => {
        setDialogState({
          visible: true,
          type: options?.title?.toLowerCase().includes("berhasil") || message.toLowerCase().includes("berhasil")
            ? "success"
            : message.toLowerCase().includes("gagal") || message.toLowerCase().includes("error")
            ? "error"
            : "alert",
          message,
          ...options,
          resolve: () => resolve(),
        });
      }),
    []
  );

  /** Pengganti confirm() — dua tombol Ya/Batal, mengembalikan boolean */
  const confirm = useCallback(
    (message: string, options?: Partial<Omit<DialogOptions, "type" | "message">>) =>
      new Promise<boolean>((resolve) => {
        setDialogState({
          visible: true,
          type: "confirm",
          message,
          ...options,
          resolve: (v) => resolve(v === true),
        });
      }),
    []
  );

  /** Pengganti prompt() — input teks, mengembalikan string atau null jika batal */
  const prompt = useCallback(
    (message: string, options?: Partial<Omit<DialogOptions, "type" | "message">>) =>
      new Promise<string | null>((resolve) => {
        setDialogState({
          visible: true,
          type: "prompt",
          message,
          ...options,
          resolve: (v) => resolve(typeof v === "string" ? v : null),
        });
      }),
    []
  );

  return { dialogState, closeDialog, alert, confirm, prompt };
}
