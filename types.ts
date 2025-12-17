export enum ImageSize {
  SIZE_1K = "1K",
  SIZE_2K = "2K",
  SIZE_4K = "4K"
}

export enum ProcessingStatus {
  IDLE = "idle",
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  ERROR = "error"
}

export interface SlidePage {
  id: string;
  pageNumber: number;
  originalImage: string; // Base64 data URL
  enhancedImage?: string; // Base64 data URL
  status: ProcessingStatus;
  errorMessage?: string;
}

export interface ProcessingStats {
  total: number;
  completed: number;
  failed: number;
}