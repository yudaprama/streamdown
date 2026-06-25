const SVG_OPEN_TAG_RE = /(<svg\b)/;

/**
 * Ensure the SVG root element declares the xlink namespace when the document
 * contains xlink-prefixed attributes (e.g. `xlink:href` used by Mermaid in
 * C4 and sequence diagrams).  Without the declaration the SVG is not valid
 * XML: browsers refuse to load it as an image, causing PNG export to fail
 * silently.
 *
 * The fix mirrors the approach used for other Mermaid SVG normalisation
 * issues: detect the problem via a lightweight string check and patch the
 * root `<svg>` opening tag in-place before any further processing.
 *
 * Falls back to the original string when the namespace is already present or
 * when xlink-prefixed attributes are absent.
 */
export const addXlinkNamespaceIfMissing = (svgString: string): string => {
  if (!svgString.includes("xlink:") || svgString.includes("xmlns:xlink")) {
    return svgString;
  }
  return svgString.replace(
    SVG_OPEN_TAG_RE,
    '$1 xmlns:xlink="http://www.w3.org/1999/xlink"'
  );
};

/**
 * Convert SVG string to PNG blob for export
 */
export const svgToPngBlob = (
  svgString: string,
  options?: { scale?: number }
): Promise<Blob> => {
  const scale = options?.scale ?? 5;

  return new Promise((resolve, reject) => {
    // Ensure the SVG is valid XML before encoding it as a data URI. Mermaid
    // can emit xlink-prefixed attributes without declaring xmlns:xlink on the
    // root element, which makes the SVG invalid XML and prevents browsers from
    // loading it as an image (causing silent PNG export failures).
    const normalizedSvg = addXlinkNamespaceIfMissing(svgString);
    const encoded =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(normalizedSvg)));

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.width * scale;
      const h = img.height * scale;

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to create 2D canvas context for PNG export"));
        return;
      }

      // Do NOT draw a background → transparency preserved
      // ctx.clearRect(0, 0, w, h);

      ctx.drawImage(img, 0, 0, w, h);

      // Export PNG (lossless, keeps transparency)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to create PNG blob"));
          return;
        }
        resolve(blob);
      }, "image/png");
    };

    img.onerror = () => reject(new Error("Failed to load SVG image"));
    img.src = encoded;
  });
};
