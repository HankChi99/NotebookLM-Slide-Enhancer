import * as pdfjsLib from 'pdfjs-dist';

// Handle ESM interop
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Use v3.11.174 which is stable and widely compatible
const PDFJS_VERSION = '3.11.174';

// Helper to load worker code as a Blob to bypass "Cross-Origin Worker" security restrictions.
// We use the 'legacy' build of the worker because the standard build uses dynamic 'import()' 
// which fails when the script is loaded from a 'blob:' URL (security restriction).
const getWorkerBlobUrl = async () => {
  const workerUrl = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.js`;
  try {
    const response = await fetch(workerUrl);
    if (!response.ok) throw new Error(`Failed to fetch worker: ${response.statusText}`);
    const workerScript = await response.text();
    const blob = new Blob([workerScript], { type: 'text/javascript' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn("Failed to create worker blob, falling back to direct URL (may fail due to CORS)", error);
    return workerUrl;
  }
};

// Initialize worker source only once
let workerSetupPromise: Promise<void> | null = null;

const ensureWorkerIsSetup = () => {
  if (!workerSetupPromise) {
    workerSetupPromise = (async () => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const blobUrl = await getWorkerBlobUrl();
        pdfjs.GlobalWorkerOptions.workerSrc = blobUrl;
      }
    })();
  }
  return workerSetupPromise;
};

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  // Ensure worker is ready before processing
  await ensureWorkerIsSetup();

  const fileData = await file.arrayBuffer();
  
  // Load the PDF document
  // Note: We use the standard cmaps, but the legacy worker handles the processing
  const loadingTask = pdfjs.getDocument({ 
    data: fileData,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // Scale up for better initial quality before AI
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not create canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    
    // Convert to high-quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    images.push(dataUrl);
  }

  return images;
};