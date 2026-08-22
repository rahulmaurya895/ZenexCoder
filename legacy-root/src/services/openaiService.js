// src/services/openaiService.js
// Minimal OpenAI streaming wrapper using official OpenAI SDK

import { OpenAI } from "openai";

// Expect OPENAI_API_KEY in environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Sends a chat completion request to OpenAI and streams tokens.
 * @param {object} payload { model: string, messages: Array<{role:string, content:string}> }
 * @param {function} onToken Callback invoked with each token chunk
 * @returns {Promise<void>}
 */
export async function streamOpenAI(payload, onToken) {
  const response = await openai.chat.completions.create({
    model: payload.model,
    messages: payload.messages,
    stream: true,
  });
  for await (const chunk of response) {
    const token = chunk.choices[0].delta?.content;
    if (token) {
      onToken(token);
    }
  }
}
