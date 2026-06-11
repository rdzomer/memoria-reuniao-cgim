import { GoogleGenAI } from "@google/genai";
import { MEETING_MINUTES_SYSTEM_PROMPT } from "../constants";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

export interface FilePart {
  mimeType: string;
  data: string; // base64
}

export async function generateMeetingMinutes(input: string, files: FilePart[] = []): Promise<string> {
  const parts: any[] = [{ text: input || "Gere a memória da reunião com base nos arquivos anexados." }];
  
  files.forEach(file => {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data
      }
    });
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      systemInstruction: MEETING_MINUTES_SYSTEM_PROMPT,
      temperature: 0.2,
      maxOutputTokens: 8192,
    }
  });

  let text = response.text || "";
  
  // Limpeza básica caso o modelo retorne markdown blocks
  text = text.replace(/```html/g, "").replace(/```/g, "").trim();

  return text;
}
