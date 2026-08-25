import { useEffect, useRef } from 'react';

export default function AudioVisualizer({ inputLevel = 0, outputLevel = 0, mode = 'listening' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    let frame = 0;
    let raf = 0;

    function draw() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      const center = height / 2;
      const level = Math.max(inputLevel, outputLevel, 0.04);
      const color = mode === 'user_speaking' ? '#22c55e' : mode === 'speaking' ? '#38bdf8' : '#a855f7';
      context.lineWidth = 2 * ratio;
      context.strokeStyle = color;

      for (let wave = 0; wave < 3; wave += 1) {
        context.globalAlpha = 0.38 + wave * 0.18;
        context.beginPath();
        for (let x = 0; x <= width; x += 3 * ratio) {
          const progress = x / width;
          const amplitude = (height * (0.08 + level * 0.34)) / (wave + 1.4);
          const y = center + Math.sin(progress * Math.PI * (2 + wave) + frame / (18 - wave * 3)) * amplitude;
          if (x === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
      }
      context.globalAlpha = 1;
      frame += 1;
      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [inputLevel, mode, outputLevel]);

  return <canvas className="voice-visualizer" ref={canvasRef} aria-hidden="true" />;
}
