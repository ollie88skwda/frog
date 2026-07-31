// Loads a photo (a signed storage URL, or an already-local blob) into an
// HTMLImageElement the canvas can safely drawImage() + later export from.
// Signed storage URLs are cross-origin — drawing them straight onto a canvas
// taints it and blocks toBlob()/toDataURL(). Fetching to a Blob first and
// loading that via an object URL keeps the pixels same-origin, same trick
// `resizePhoto` already relies on elsewhere in this codebase.
export async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url);
  // Signed storage URLs expire; an expired one answers 4xx with an XML/HTML
  // error body that would otherwise be handed to the decoder as "an image".
  if (!res.ok) throw new Error(`photo fetch failed (${res.status})`);
  const blob = await res.blob();
  return loadImageFromBlob(blob);
}

export async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.src = objUrl;
  try {
    // decode() (not onload) so the bitmap is fully in memory before the object
    // URL is revoked — a load-only wait can leave the browser needing to
    // re-fetch a src that no longer resolves.
    await img.decode();
    return img;
  } catch {
    throw new Error("photo failed to decode");
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}
