import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { AudioTrack } from '../../types';
import { useAudio } from '../../contexts/AudioContext';

const WaveformContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

const Canvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
  cursor: pointer;
`;

interface WaveformDisplayProps {
  track: AudioTrack;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ track }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, seekTo } = useAudio();
  const { duration } = state;

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
    const amplitude = height * 0.3;
    const barWidth = width / track.waveform.length;

    ctx.strokeStyle = track.color;
    ctx.fillStyle = track.color + '40';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let i = 0; i < track.waveform.length; i++) {
      const x = i * barWidth;
      const y = centerY + (track.waveform[i] * amplitude * (track.volume / 100));
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    ctx.lineTo(width, centerY);
    ctx.lineTo(0, centerY);
    ctx.closePath();
    ctx.fill();
  }, [track.waveform, track.color, track.volume]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;

    const updateTimeFromPosition = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = x / rect.width;
      const time = ratio * duration;
      seekTo(time);
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateTimeFromPosition(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    updateTimeFromPosition(e.clientX);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <WaveformContainer ref={containerRef}>
      <Canvas ref={canvasRef} onMouseDown={handleMouseDown} />
    </WaveformContainer>
  );
};

export default WaveformDisplay;