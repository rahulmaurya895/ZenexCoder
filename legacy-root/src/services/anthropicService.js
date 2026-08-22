// src/services/anthropicService.js
// Simple streaming wrapper for Anthropic's Claude model using @anthropic-ai/sdk

import { Anthropic } from "@anthropic-ai/sdk";

// Expect ANTHROPIC_API_KEY in environment variables
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Streams a chat completion from Anthropic.
 * @param {object} payload { model:string, messages:Array<{role:string, content:string}> }
 * @param {function} onToken callback invoked with each token string
 */
export async function stream(payload, onToken) {
  const response = await anthropic.messages.create({
    model: payload.model,
    max_tokens: 1024,
    temperature: 0.7,
    stream: true,
    messages: payload.messages.map(m => ({ role: m.role, content: m.content })),
  });
  for await (const chunk of response) {
    if (chunk.type === "content_block_delta" && chunk.delta?.text) {
      onToken(chunk.delta.text);
    }
  }
}
