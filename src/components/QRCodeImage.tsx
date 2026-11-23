import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  text: string;
  size?: number;
  className?: string;
}

export default function QRCodeImage({ text, size = 80, className = "" }: Props) {
  const [qrSrc, setQrSrc] = useState<string>("");

  useEffect(() => {
    if (!text) return;
    QRCode.toDataURL(text, {
      width: size * 2, // 2x resolution for sharp print output
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then(setQrSrc)
      .catch((err) => console.error("Gagal generate QR Code:", err));
  }, [text, size]);

  if (!qrSrc) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-slate-100 animate-pulse rounded border border-slate-200 ${className}`}
      />
    );
  }

  return (
    <img
      src={qrSrc}
      alt="QR Code Verifikasi SATRIA"
      style={{ width: size, height: size }}
      className={`object-contain ${className}`}
    />
  );
}
