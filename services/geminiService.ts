import { GoogleGenAI } from "@google/genai";
import { ImageSize } from "../types";
import { ENHANCEMENT_PROMPT } from "../constants";

// Helper to remove data URL prefix for API
const cleanBase64 = (dataUrl: string) => {
  return dataUrl.split(',')[1];
};

export const enhanceSlideImage = async (
  originalImageBase64: string,
  size: ImageSize,
  contextText: string = "",
  apiKey: string
): Promise<string> => {
  
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Nano Banana Pro / Gemini Pro Image Mapping
    const modelName = 'gemini-3-pro-image-preview';

    // Construct the final prompt with context if provided
    let finalPrompt = ENHANCEMENT_PROMPT;
    if (contextText.trim()) {
      finalPrompt += `\n\n=== REFERENCE CONTEXT FROM NOTEBOOKLM ===\n${contextText.trim()}\n==========================================\n\nUse the above context to verify all text content on the slide.`;
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            text: finalPrompt,
          },
          {
            inlineData: {
              mimeType: 'image/jpeg', // Assuming canvas export is JPEG
              data: cleanBase64(originalImageBase64),
            },
          },
        ],
      },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: "16:9", // Slides are usually 16:9
        }
      },
    });

    // Iterate through parts to find the image
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated in response.");

  } catch (error) {
    console.error("Gemini Image Enhancement Error:", error);
    throw error;
  }
};