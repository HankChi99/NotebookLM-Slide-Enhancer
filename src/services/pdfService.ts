// We access the global pdfjsLib loaded via CDN in index.html
// This bypasses complex build issues with pdfjs-dist + Vite
const pdfjs = (window as any).pdfjsLib;

if (!pdfjs) {
  console.error("PDF.js library not loaded! Check index.html");
}

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  // Worker is already configured in index.html, no need to setup here
  
  const fileData = await file.arrayBuffer();
  
  // Load the PDF document
  // We use standard font data url from CDN just in case
  const loadingTask = pdfjs.getDocument({ 
    data: fileData,
    cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/`,
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // Scale up for better quality
    
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