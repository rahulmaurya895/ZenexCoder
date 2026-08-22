import { ImagePlus, Upload, X } from 'lucide-react';
import { useState } from 'react';

export default function ImageDropzone({ onImageDropped, children }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer?.files || []);
    const imageFile = files.find((f) => f.type.startsWith('image/'));

    if (imageFile) {
      const reader = new FileReader();
      reader.onload = async () => {
        const rawDataUrl = reader.result;
        let compressed = { dataUrl: rawDataUrl, base64: rawDataUrl.split(',')[1] };
        if (window.zenexcoder?.vision?.compressImage) {
          compressed = await window.zenexcoder.vision.compressImage(rawDataUrl);
        }
        onImageDropped?.({
          type: 'image',
          name: imageFile.name,
          mimeType: compressed.mimeType || imageFile.type,
          base64: compressed.base64,
          dataUrl: compressed.dataUrl
        });
      };
      reader.readAsDataURL(imageFile);
    }
  }

  return (
    <div
      className={`image-dropzone-wrapper ${isDragging ? 'dragging-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="dropzone-overlay">
          <Upload size={32} className="text-accent animate-bounce" />
          <div className="font-bold text-sm text-accent">Drop Wireframe / Screenshot to Convert to React Code</div>
        </div>
      )}
      {children}
    </div>
  );
}
