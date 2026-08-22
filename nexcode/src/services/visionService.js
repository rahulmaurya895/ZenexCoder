import { USER_PROMPTS } from '@/utils/promptTemplates';

export const VISION_TASKS = [
  { id: 'screenshotToCode', label: 'Screenshot to Code', prompt: USER_PROMPTS.screenshotToCode },
  { id: 'diagramToCode', label: 'Diagram to Code', prompt: USER_PROMPTS.diagramToCode },
  { id: 'analyzeError', label: 'Bug Screenshot', prompt: USER_PROMPTS.analyzeError },
  { id: 'documentToData', label: 'Document Data', prompt: USER_PROMPTS.documentToData },
  { id: 'handwrittenToCode', label: 'Handwriting', prompt: USER_PROMPTS.handwrittenToCode },
  { id: 'uiReview', label: 'UI Review', prompt: USER_PROMPTS.uiReview }
];

export async function captureScreen() {
  return window.zenexcoder.vision.captureScreen();
}

export async function openImage() {
  return window.zenexcoder.vision.openImageDialog();
}

export async function readImage(filePath) {
  return window.zenexcoder.vision.readImage(filePath);
}
