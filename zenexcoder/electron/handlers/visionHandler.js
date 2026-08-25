import { desktopCapturer, ipcMain, dialog, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  if (ext === '.gif') {
    return 'image/gif';
  }
  return 'image/png';
}

function compressImageDataUrl(dataUrl, maxDimension = 1280) {
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return dataUrl;

    const size = img.getSize();
    if (size.width > maxDimension || size.height > maxDimension) {
      const resized = img.resize({
        width: size.width >= size.height ? maxDimension : undefined,
        height: size.height > size.width ? maxDimension : undefined,
        quality: 'good'
      });
      const compressedJpeg = resized.toJPEG(80);
      const base64 = compressedJpeg.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    }
  } catch (err) {
    console.warn('[VisionHandler] NativeImage compression warning:', err.message);
  }
  return dataUrl;
}

async function imagePayload(filePath) {
  const buffer = await fs.readFile(filePath);
  const mimeType = mimeFromPath(filePath);
  const rawBase64 = buffer.toString('base64');
  const rawDataUrl = `data:${mimeType};base64,${rawBase64}`;
  const compressedDataUrl = compressImageDataUrl(rawDataUrl, 1280);
  const compressedBase64 = compressedDataUrl.replace(/^data:image\/\w+;base64,/, '');

  return {
    filePath,
    name: path.basename(filePath),
    mimeType: 'image/jpeg',
    base64: compressedBase64,
    dataUrl: compressedDataUrl
  };
}

export function registerVisionHandlers() {
  ipcMain.handle('screen:capture', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1600, height: 1000 }
      });
      const source = sources.find((item) => item.name.toLowerCase().includes('screen')) || sources[0];
      if (!source) {
        throw new Error('No screen source found.');
      }
      const dataUrl = source.thumbnail.toDataURL();
      const compressedDataUrl = compressImageDataUrl(dataUrl, 1280);
      const base64 = compressedDataUrl.replace(/^data:image\/\w+;base64,/, '');

      return {
        id: source.id,
        name: source.name,
        mimeType: 'image/jpeg',
        base64,
        dataUrl: compressedDataUrl
      };
    } catch (error) {
      throw new Error(`Unable to capture screen: ${error.message}`);
    }
  });

  ipcMain.handle('vision:open-image-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS].map((ext) => ext.slice(1)) }]
      });
      if (result.canceled || !result.filePaths[0]) {
        return null;
      }
      return await imagePayload(result.filePaths[0]);
    } catch (error) {
      throw new Error(`Unable to open image: ${error.message}`);
    }
  });

  ipcMain.handle('vision:read-image', async (_event, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        throw new Error('Selected file is not a supported image.');
      }
      return await imagePayload(filePath);
    } catch (error) {
      throw new Error(`Unable to read image: ${error.message}`);
    }
  });

  ipcMain.handle('vision:compress-image', async (_event, dataUrl) => {
    const compressedDataUrl = compressImageDataUrl(dataUrl, 1280);
    const base64 = compressedDataUrl.replace(/^data:image\/\w+;base64,/, '');
    return {
      mimeType: 'image/jpeg',
      base64,
      dataUrl: compressedDataUrl
    };
  });
}
