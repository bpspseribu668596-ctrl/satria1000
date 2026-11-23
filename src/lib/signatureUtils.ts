/**
 * Helper utility for compressing signatures to small, crisp, transparent PNGs
 * Strips white paper backgrounds and scales down to max 350x160.
 */
export const compressSignatureToDataUrl = (
  dataUrlOrFile: string | File,
  maxWidth = 350,
  maxHeight = 160
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(typeof dataUrlOrFile === "string" ? dataUrlOrFile : "");
        return;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Remove white/light backgrounds (from paper or jpeg) to guarantee transparent PNG signature
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const a = d[i + 3];
          if (a > 0) {
            if (r > 215 && g > 215 && b > 215) {
              d[i + 3] = 0;
            } else if (r > 190 && g > 190 && b > 190) {
              const brightness = (r + g + b) / 3;
              const alphaFactor = (215 - brightness) / 25;
              d[i + 3] = Math.round(a * Math.max(0, Math.min(1, alphaFactor)));
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback if getImageData is restricted (e.g. CORS)
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      resolve(typeof dataUrlOrFile === "string" ? dataUrlOrFile : "");
    };

    if (typeof dataUrlOrFile === "string") {
      img.src = dataUrlOrFile;
    } else {
      const r = new FileReader();
      r.onload = (ev) => {
        img.src = ev.target?.result as string;
      };
      r.readAsDataURL(dataUrlOrFile);
    }
  });
};
