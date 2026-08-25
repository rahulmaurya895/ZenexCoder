import { Camera } from 'lucide-react';
import { captureScreen } from '@/services/visionService';

/**
 * @param {{onCapture: (image: object) => void}} props
 */
export default function ScreenCapture({ onCapture }) {
  return (
    <button
      onClick={async () => {
        const image = await captureScreen();
        onCapture(image);
      }}
    >
      <Camera size={14} /> Capture Screen
    </button>
  );
}
