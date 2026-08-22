// d:/nexCode/nexcode/test/aiServiceTest.js
// Automated verification script for NexCode services and backend endpoints

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOllamaInstalled, checkOllamaRunning } from '../electron/handlers/ollamaHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runVerification() {
  console.log('====================================================');
  console.log('   NexCode Automated Backend Verification Suite   ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Local File I/O
  try {
    const testFile = path.join(__dirname, 'temp_test.txt');
    const testData = `NexCode test verification - ${new Date().toISOString()}`;
    await fs.writeFile(testFile, testData, 'utf-8');
    const readData = await fs.readFile(testFile, 'utf-8');
    await fs.unlink(testFile);

    if (readData === testData) {
      console.log('✅ Test 1 Passed: File System Read & Write operation successful.');
      passed++;
    } else {
      throw new Error('Data mismatch in file read/write');
    }
  } catch (err) {
    console.error('❌ Test 1 Failed:', err.message);
    failed++;
  }

  // Test 2: Ollama Binary & Status Check
  try {
    const isInstalled = await checkOllamaInstalled();
    const runningState = await checkOllamaRunning();
    console.log(`✅ Test 2 Passed: Ollama Check (Installed: ${isInstalled}, Running: ${runningState.running})`);
    passed++;
  } catch (err) {
    console.error('❌ Test 2 Failed:', err.message);
    failed++;
  }

  // Test 3: Environment & Provider Keys
  try {
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    console.log(`✅ Test 3 Passed: Environment provider status logged (OpenAI: ${hasOpenAI}, Anthropic: ${hasAnthropic}, Gemini: ${hasGemini})`);
    passed++;
  } catch (err) {
    console.error('❌ Test 3 Failed:', err.message);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});

