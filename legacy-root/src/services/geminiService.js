// src/services/geminiService.js
// Minimal wrapper for Google Gemini via @google/generative-ai SDK

import { GoogleGenerativeAI } from "@google/generative-ai";

// Expect GOOGLE_GEMINI_API_KEY in environment
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

/**
 * Streams a chat completion from Gemini.
 * @param {object} payload { model:string, messages:Array<{role:string, content:string}> }
 * @param {function} onToken callback for each token fragment
 */
export async function stream(payload, onToken) {
  const model = genAI.getGenerativeModel({ model: payload.model });
  const result = await model.generateContentStream(payload.messages.map(m => m.content).join('\n'));
  for await (const chunk of result) {
    const text = chunk?.text();
    if (text) {
      onToken(text);
    }
  }
}
