import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { SlidePage, ProcessingStatus } from '../types';

interface SlideCardProps {
  slide: SlidePage;
  onRetry: () => void;
}

export const SlideCard: React.FC<SlideCardProps> = ({ slide, onRetry }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <span className="font-semibold text-gray-700">Slide {slide.pageNumber}</span>
        <StatusBadge status={slide.status} />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Original */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Original</span>
          <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
            <img 
              src={slide.originalImage} 
              alt={`Original Slide ${slide.pageNumber}`} 
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Enhanced */}
        <div className="flex flex-col gap-2">
           <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Enhanced (Gemini 3 Pro)</span>
           <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
             {slide.enhancedImage ? (
               <img 
                 src={slide.enhancedImage} 
                 alt={`Enhanced Slide ${slide.pageNumber}`} 
                 className="w-full h-full object-contain cursor-pointer transition-transform hover:scale-105"
                 onClick={() => {
                   const win = window.open();
                   win?.document.write(`<img src="${slide.enhancedImage}" style="width:100%;"/>`);
                 }}
               />
             ) : (
               <div className="text-gray-400 flex flex-col items-center gap-2 p-4 text-center w-full">
                 {slide.status === ProcessingStatus.PROCESSING ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                 ) : slide.status === ProcessingStatus.ERROR ? (
                   <div className="flex flex-col items-center gap-3 w-full">
                     <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                       <AlertCircle className="w-4 h-4" />
                       <span>Enhancement Failed</span>
                     </div>
                     <p className="text-xs text-red-400 px-2 line-clamp-2 max-w-[200px]">{slide.errorMessage || "Unknown error"}</p>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onRetry();
                       }}
                       className="mt-1 flex items-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md text-xs font-medium transition-colors border border-red-200"
                     >
                       <RefreshCw className="w-3 h-3" />
                       Retry Page
                     </button>
                   </div>
                 ) : (
                   <span className="text-sm">Waiting to process...</span>
                 )}
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ProcessingStatus }> = ({ status }) => {
  const styles = {
    [ProcessingStatus.IDLE]: "bg-gray-100 text-gray-600",
    [ProcessingStatus.PENDING]: "bg-yellow-50 text-yellow-700",
    [ProcessingStatus.PROCESSING]: "bg-blue-50 text-blue-700 animate-pulse",
    [ProcessingStatus.COMPLETED]: "bg-green-50 text-green-700",
    [ProcessingStatus.ERROR]: "bg-red-50 text-red-700",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};