import React, { useState, useEffect, useRef } from 'react';
import PptxGenJS from 'pptxgenjs';
import { Download, FileUp, Sparkles, AlertCircle, Image as ImageIcon, Loader2, LayoutTemplate, BookOpen, ChevronDown, ChevronUp, Key, LogOut } from 'lucide-react';
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
  const [apiKey, setApiKey] = useState<string>("");
  const [manualKeyInput, setManualKeyInput] = useState<string>("");
  const [isIdxEnv, setIsIdxEnv] = useState<boolean>(false);
  
  const [pages, setPages] = useState<SlidePage[]>([]);
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.SIZE_2K);
  const [contextText, setContextText] = useState<string>("");
  const [showContextInput, setShowContextInput] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef<boolean>(false);

  // Initialize API Key Logic
  useEffect(() => {
    const initKey = async () => {
      // 1. Check if running in Project IDX / AI Studio
      const aistudio = (window as any).aistudio as AIStudio | undefined;
      
      if (process.env.API_KEY) {
        // Injected by environment (IDX or .env file)
        setApiKey(process.env.API_KEY);
        setIsIdxEnv(true);
      } else if (aistudio && await aistudio.hasSelectedApiKey()) {
        // Selected via AI Studio UI
        setApiKey("IDX_MANAGED_KEY"); // We assume the environment injects it globally if selected
        setIsIdxEnv(true);
      } else {
        // 2. Check Local Storage for manually entered key
        const storedKey = localStorage.getItem("gemini_api_key");
        if (storedKey) {
          setApiKey(storedKey);
        }
      }
    };
    initKey();
  }, []);

  const handleIdxSelectKey = async () => {
    try {
      const aistudio = (window as any).aistudio as AIStudio | undefined;
      if (aistudio) {
        await aistudio.openSelectKey();
        // Force reload or re-check would typically happen here, 
        // but in IDX the env var usually updates.
        window.location.reload(); 
      }
    } catch (e) {
      console.error(e);
      setError("Failed to select API Key via AI Studio.");
    }
  };

  const handleManualKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualKeyInput.trim().length > 10) {
      const key = manualKeyInput.trim();
      setApiKey(key);
      localStorage.setItem("gemini_api_key", key);
      setError(null);
    } else {
      setError("Invalid API Key format.");
    }
  };

  const clearApiKey = () => {
    setApiKey("");
    localStorage.removeItem("gemini_api_key");
    setPages([]);
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
    
    // Final check for API key
    const currentKey = apiKey || process.env.API_KEY;
    if (!currentKey) {
      setError("API Key is missing. Please configure it.");
      return;
    }

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
        const enhancedUrl = await enhanceSlideImage(pages[index].originalImage, imageSize, contextText, currentKey);
        
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
    
    const currentKey = apiKey || process.env.API_KEY;
    if (!currentKey) {
      setError("API Key missing");
      return;
    }

    // Update status to processing for this specific slide
    setPages(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: ProcessingStatus.PROCESSING, errorMessage: undefined };
      return next;
    });

    try {
      // Use current selected image size for retry
      const enhancedUrl = await enhanceSlideImage(pages[index].originalImage, imageSize, contextText, currentKey);
      
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
    
    pages.forEach(page => {
      const slide = pptx.addSlide();
      const imageSource = page.enhancedImage || page.originalImage;
      
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

  // Render Logic: If no API key is set, show the setup screen
  if (!apiKey && !process.env.API_KEY) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{APP_TITLE}</h1>
          <p className="text-gray-600 mb-6">{APP_DESCRIPTION}</p>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
             <h3 className="font-semibold text-yellow-800 text-sm mb-1">Setup Required</h3>
             <p className="text-xs text-yellow-700 mb-2">
               To use the <strong>Gemini 3 Pro Image</strong> model, you need a Google Gemini API Key.
             </p>
             <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-1">
               Get a free API Key here <Key className="w-3 h-3"/>
             </a>
          </div>

          <div className="space-y-4">
            {/* Manual Input for Vercel/Public usage */}
            <form onSubmit={handleManualKeySubmit} className="flex flex-col gap-3">
              <input 
                type="password" 
                value={manualKeyInput}
                onChange={(e) => setManualKeyInput(e.target.value)}
                placeholder="Paste your API Key (AIza...)"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                Start App
              </button>
            </form>

            {/* Separator */}
            <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase">OR</span>
                <div className="flex-grow border-t border-gray-300"></div>
            </div>

            {/* IDX Button */}
            <button
              onClick={handleIdxSelectKey}
              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-6 rounded-lg transition duration-200 text-sm"
            >
              Select Key via Google IDX
            </button>
          </div>
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
             <button
                onClick={clearApiKey}
                className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                title="Clear API Key"
             >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Exit</span>
             </button>

             {pages.length > 0 && (
                <>
                  <div className="h-6 w-px bg-gray-200 mx-1"></div>
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