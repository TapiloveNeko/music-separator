import React, { useEffect, useRef } from 'react';
import { AudioTrack } from '../../types';
import { useAudio } from '../../contexts/AudioContext';

interface WaveformDisplayProps {
  track: AudioTrack;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ track }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, seekTo, setDragPosition, setIsDragging } = useAudio();
  const { duration, dragPosition, isDragging } = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || track.waveform.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const amplitude = height * 2.5;
    const barWidth = width / track.waveform.length;

    ctx.fillStyle = track.color;

    ctx.beginPath();
    
    const firstX = 0;
    const firstWaveAmplitude = track.waveform[0] * amplitude * (track.volume / 100) / 2;
    const firstY = centerY - firstWaveAmplitude;
    ctx.moveTo(firstX, firstY);

    for (let i = 1; i < track.waveform.length; i++) {
      const x = i * barWidth;
      const waveAmplitude = track.waveform[i] * amplitude * (track.volume / 100) / 2;
      const y = centerY - waveAmplitude;
      ctx.lineTo(x, y);
    }

    for (let i = track.waveform.length - 1; i >= 0; i--) {
      const x = i * barWidth;
      const waveAmplitude = track.waveform[i] * amplitude * (track.volume / 100) / 2;
      const y = centerY + waveAmplitude;
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    if (isDragging && dragPosition !== null) {
      const dragX = (dragPosition / duration) * width;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dragX, 0);
      ctx.lineTo(dragX, height);
      ctx.stroke();
    }
  }, [track.waveform, track.color, track.volume, duration, dragPosition, isDragging]);

  const getClientX = (event: MouseEvent | TouchEvent): number => {
    if ('touches' in event && event.touches[0]) return event.touches[0].clientX;
    if ('changedTouches' in event && (event as TouchEvent).changedTouches[0]) return (event as TouchEvent).changedTouches[0].clientX;
    return (event as MouseEvent).clientX;
  };

  const handleStart = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const initialTime = (x / rect.width) * duration;
    setDragPosition(initialTime);
    setIsDragging(true);

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const x = Math.max(0, Math.min(getClientX(moveEvent) - rect.left, rect.width));
      setDragPosition((x / rect.width) * duration);
    };

    const handleUp = (upEvent: MouseEvent | TouchEvent) => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
      const x = Math.max(0, Math.min(getClientX(upEvent) - rect.left, rect.width));
      seekTo((x / rect.width) * duration);
      setIsDragging(false);
      setDragPosition(null);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas 
        ref={canvasRef} 
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        className="w-full h-full block cursor-pointer"
      />
    </div>
  );
};

export default WaveformDisplay;