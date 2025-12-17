import React, { useState, useEffect, useRef } from 'react';
import PptxGenJS from 'pptxgenjs';
import { Download, FileUp, Sparkles, AlertCircle, Image as ImageIcon, Loader2, LayoutTemplate, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { SlidePage, ImageSize, ProcessingStatus } from './types';
import { APP_TITLE, APP_DESCRIPTION } from './constants';
import { convertPdfToImages } from './services/pdfService';
import { enhanceSlideImage } from './services/geminiService';
import { SlideCard } from './components/SlideCard';

// Define the shape we expect, but do not augment Window globally to avoid conflicts
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

const App: React.FC = () => {
  const [apiKeyReady, setApiKeyReady] = useState<boolean>(false);
  const [pages, setPages] = useState<SlidePage[]>([]);
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.SIZE_2K);
  const [contextText, setContextText] = useState<string>("");
  const [showContextInput, setShowContextInput] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef<boolean>(false);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      // Use type assertion to access aistudio on window
      const aistudio = (window as any).aistudio as AIStudio | undefined;
      if (aistudio && await aistudio.hasSelectedApiKey()) {
        setApiKeyReady(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      const aistudio = (window as any).aistudio as AIStudio | undefined;
      if (aistudio) {
        await aistudio.openSelectKey();
        if (await aistudio.hasSelectedApiKey()) {
          setApiKeyReady(true);
          setError(null);
        }
      } else {
        setError("AI Studio environment not detected.");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to select API Key.");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError("Please upload a valid PDF file.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      const imageUrls = await convertPdfToImages(file);
      
      const newPages: SlidePage[] = imageUrls.map((url, index) => ({
        id: `page-${index}`,
        pageNumber: index + 1,
        originalImage: url,
        status: ProcessingStatus.IDLE,
      }));

      setPages(newPages);
      setIsProcessing(false);
    } catch (err: any) {
      console.error("PDF Processing Error:", err);
      // Show the actual error message to help debugging
      setError(`Failed to process PDF: ${err.message || "Unknown error occurred. Please try a different PDF or refresh."}`);
      setIsProcessing(false);
    }
  };

  const processQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    // Filter pages that are idle or failed (to retry)
    const queueIndices = pages
      .map((p, i) => (p.status === ProcessingStatus.IDLE || p.status === ProcessingStatus.ERROR) ? i : -1)
      .filter(i => i !== -1);

    for (const index of queueIndices) {
      if (!processingRef.current) break; // Allow stop

      setCurrentProcessingIndex(index);
      
      // Update status to processing
      setPages(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: ProcessingStatus.PROCESSING, errorMessage: undefined };
        return next;
      });

      try {
        const enhancedUrl = await enhanceSlideImage(pages[index].originalImage, imageSize, contextText);
        
        setPages(prev => {
          const next = [...prev];
          next[index] = { 
            ...next[index], 
            enhancedImage: enhancedUrl, 
            status: ProcessingStatus.COMPLETED 
          };
          return next;
        });
      } catch (e: any) {
        setPages(prev => {
          const next = [...prev];
          next[index] = { 
            ...next[index], 
            status: ProcessingStatus.ERROR,
            errorMessage: e.message || "Enhancement failed"
          };
          return next;
        });
        // Continue to next slide even if one fails
      }
    }

    setCurrentProcessingIndex(-1);
    setIsProcessing(false);
    processingRef.current = false;
  };

  const retrySlide = async (index: number) => {
    if (!pages[index]) return;

    // Update status to processing for this specific slide
    setPages(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: ProcessingStatus.PROCESSING, errorMessage: undefined };
      return next;
    });

    try {
      // Use current selected image size for retry
      const enhancedUrl = await enhanceSlideImage(pages[index].originalImage, imageSize, contextText);
      
      setPages(prev => {
        const next = [...prev];
        next[index] = { 
          ...next[index], 
          enhancedImage: enhancedUrl, 
          status: ProcessingStatus.COMPLETED 
        };
        return next;
      });
    } catch (e: any) {
      setPages(prev => {
        const next = [...prev];
        next[index] = { 
          ...next[index], 
          status: ProcessingStatus.ERROR,
          errorMessage: e.message || "Retry failed"
        };
        return next;
      });
    }
  };

  const stopProcessing = () => {
    processingRef.current = false;
    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
  };

  const downloadPPTX = (type: 'standard' | 'google') => {
    const pptx = new PptxGenJS();
    
    // Check if we have any processed pages, if not, warn user or just export originals?
    // Let's prioritize enhanced, fallback to original if missing.
    pages.forEach(page => {
      const slide = pptx.addSlide();
      const imageSource = page.enhancedImage || page.originalImage;
      
      // Add image to slide (stretch to fit 16:9)
      slide.addImage({
        data: imageSource,
        x: 0,
        y: 0,
        w: "100%",
        h: "100%",
        sizing: { type: 'contain', w: '100%', h: '100%' }
      });
    });

    const prefix = type === 'google' ? 'Google_Slides_Compatible' : 'Enhanced_Slides';
    pptx.writeFile({ fileName: `${prefix}_${new Date().toISOString().slice(0,10)}.pptx` });
  };

  const completedCount = pages.filter(p => p.status === ProcessingStatus.COMPLETED).length;
  const progressPercent = pages.length > 0 ? (completedCount / pages.length) * 100 : 0;

  if (!apiKeyReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{APP_TITLE}</h1>
          <p className="text-gray-600 mb-8">{APP_DESCRIPTION}</p>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
             <h3 className="font-semibold text-yellow-800 text-sm mb-1">Billing Requirement</h3>
             <p className="text-xs text-yellow-700 mb-2">
               To use the <strong>Gemini 3 Pro Image</strong> model ("Nano Banana Pro"), you must select a paid project API key. 
               <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline ml-1">Learn more about billing.</a>
             </p>
             <div className="border-t border-yellow-200 pt-2 mt-2">
               <h4 className="font-semibold text-yellow-800 text-xs mb-1">Have Gemini Advanced?</h4>
               <p className="text-xs text-yellow-700">
                  Your "Gemini Advanced" subscription is for the chat interface. For this app, you still need to generate an API Key. 
                  Don't worry—click the button below, select "Create Project", and you can often start for free or use your cloud billing.
               </p>
             </div>
          </div>

          <button
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center gap-2"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 hidden sm:block">{APP_TITLE}</h1>
          </div>
          
          <div className="flex items-center gap-3">
             {pages.length > 0 && (
                <>
                  <button
                    onClick={() => downloadPPTX('standard')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">PPTX</span>
                  </button>
                  <button
                    onClick={() => downloadPPTX('google')}
                    className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                    title="Download compatible file for Google Slides"
                  >
                    <LayoutTemplate className="w-4 h-4" />
                    <span className="hidden sm:inline">Google Slides</span>
                  </button>
                </>
             )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Controls Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col gap-6">
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
              {/* File Upload */}
              <div className="md:col-span-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  1. Upload NotebookLM PDF
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-indigo-50 file:text-indigo-700
                      hover:file:bg-indigo-100
                      cursor-pointer border border-gray-300 rounded-lg bg-gray-50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Config */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  2. Target Quality
                </label>
                <div className="relative">
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as ImageSize)}
                    disabled={isProcessing}
                    className="block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg border bg-white"
                  >
                    <option value={ImageSize.SIZE_1K}>1K Resolution</option>
                    <option value={ImageSize.SIZE_2K}>2K Resolution</option>
                    <option value={ImageSize.SIZE_4K}>4K Resolution (Slow)</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="md:col-span-4 flex gap-2">
                {!isProcessing ? (
                  <button
                    onClick={processQueue}
                    disabled={pages.length === 0}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white transition-all
                      ${pages.length === 0 
                        ? 'bg-gray-300 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg'}`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Start Enhancement
                  </button>
                ) : (
                  <button
                    onClick={stopProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Stop Processing
                  </button>
                )}
              </div>
            </div>

            {/* Optional NotebookLM Context */}
            <div className="border-t border-gray-100 pt-4">
               <button 
                 onClick={() => setShowContextInput(!showContextInput)}
                 className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none"
               >
                 <BookOpen className="w-4 h-4" />
                 <span>3. (Optional) Enhance with NotebookLM Context</span>
                 {showContextInput ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
               </button>
               
               {showContextInput && (
                 <div className="mt-3 animate-fadeIn">
                   <p className="text-xs text-gray-500 mb-2">
                     Paste your <strong>NotebookLM briefing doc, summary, or audio transcript</strong> here. 
                     The AI will use this to correct specific terms and improve OCR accuracy on the slides.
                   </p>
                   <textarea
                     value={contextText}
                     onChange={(e) => setContextText(e.target.value)}
                     placeholder="Paste NotebookLM content here..."
                     className="w-full h-32 p-3 text-sm text-gray-700 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                   />
                 </div>
               )}
            </div>

            {error && (
              <div className="p-4 bg-red-50 rounded-lg flex items-start gap-3 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {pages.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Progress: {completedCount} / {pages.length} slides</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {pages.length === 0 && !error && (
          <div className="text-center py-20 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileUp className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No PDF uploaded yet</h3>
            <p className="text-gray-500 mt-1 max-w-md mx-auto">
              Upload a PDF exported from NotebookLM to begin the enhancement process.
            </p>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
          {pages.map((page, index) => (
            <SlideCard 
              key={page.id} 
              slide={page} 
              onRetry={() => retrySlide(index)}
            />
          ))}
        </div>

      </main>
    </div>
  );
};

export default App;