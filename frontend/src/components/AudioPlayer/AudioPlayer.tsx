import React, { useEffect, useRef, useState } from 'react';
import { useAudio } from '../../contexts/AudioContext';

const AudioPlayer: React.FC = () => {
  const { state, togglePlayback, exportTracks, resetApp, seekTo } = useAudio();
  const { isPlaying, currentTime, audioInfo, processingStatus } = state;
  const [timeInput, setTimeInput] = useState('00:00.0');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying) {
      interval = setInterval(() => {
      }, 100);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isEditing) {
      setTimeInput(formatTime(currentTime));
    }
  }, [currentTime, isEditing]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decisecs = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${decisecs}`;
  };

  const parseTime = (timeStr: string): number | null => {
    const match = timeStr.match(/^(\d{1,4}):(\d{2})\.(\d)$/);
    if (!match) return null;

    const mins = parseInt(match[1]);
    const secs = parseInt(match[2]);
    const decisecs = parseInt(match[3]);

    if (secs >= 60) return null;

    return mins * 60 + secs + decisecs / 10;
  };

  const handleResetToStart = () => {
    seekTo(0);
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    const colonCount = (value.match(/:/g) || []).length;
    const dotCount = (value.match(/\./g) || []).length;
    
    if (colonCount !== 1 || dotCount !== 1) {
      return;
    }
    
    if (/^\d{0,4}:\d{0,2}\.\d?$/.test(value)) {
      setTimeInput(value);
    }
  };

  const handleTimeInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsEditing(true);
    e.target.select();
  };

  const handleTimeInputBlur = () => {
    setIsEditing(false);
    const parsedTime = parseTime(timeInput);
    
    if (parsedTime !== null) {
      seekTo(parsedTime);
      setTimeInput(formatTime(parsedTime));
    } else {
      setTimeInput(formatTime(currentTime));
    }
  };

  const handleTimeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const parsedTime = parseTime(timeInput);
      
      if (parsedTime !== null) {
        seekTo(parsedTime);
        setTimeInput(formatTime(parsedTime));
      } else {
        setTimeInput(formatTime(currentTime));
      }
      (e.target as HTMLInputElement).blur();
      return;
    } else if (e.key === 'Escape') {
      setTimeInput(formatTime(currentTime));
      (e.target as HTMLInputElement).blur();
      return;
    }
  
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const input = e.target as HTMLInputElement;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      
      if (e.key === 'Backspace' && start > 0) {
        const charBefore = timeInput[start - 1];
        if (charBefore === ':' || charBefore === '.') {
          e.preventDefault();
          return;
        }
      }
      
      if (e.key === 'Delete' && start < timeInput.length) {
        const charAfter = timeInput[start];
        if (charAfter === ':' || charAfter === '.') {
          e.preventDefault();
          return;
        }
      }
      
      if (start !== end) {
        const selectedText = timeInput.substring(start, end);
        if (selectedText.includes(':') || selectedText.includes('.')) {
          e.preventDefault();
          return;
        }
      }
    }
  
    if (!/[0-9]/.test(e.key) && !['ArrowLeft', 'ArrowRight', 'Delete', 'Backspace', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const canExport = processingStatus.status === 'completed';

  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-6 md:gap-12 mt-6 md:mt-12 border-t border-white/10 pt-6 md:pt-12">
      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 w-full md:w-auto">
        <div className="flex justify-between items-center w-full md:w-auto md:gap-6">
          <input
            type="text"
            value={timeInput}
            onChange={handleTimeInputChange}
            onFocus={handleTimeInputFocus}
            onBlur={handleTimeInputBlur}
            onKeyDown={handleTimeInputKeyDown}
            placeholder="MM:SS.D"
            maxLength={8}
            className="text-[1.6rem] md:text-[2rem] font-medium font-mono bg-black/30 py-2 md:py-3 px-4 md:px-6 rounded-[10px] border border-transparent text-white w-[100px] md:w-[120px] text-center outline-none cursor-text focus:border-white/30 focus:bg-black/40 md:hidden"
          />
          <div className="flex gap-4 items-center">
            <button 
              onClick={handleResetToStart}
              className="w-[45px] md:w-[50px] h-[45px] md:h-[50px] rounded-full border-none bg-secondary text-white text-[1.8rem] md:text-[2rem] cursor-pointer transition-all duration-300 grid place-content-center shadow-[0_4px_15px_rgba(142,68,173,0.3)] hover:scale-95 hover:shadow-none"
            >
              ⏮
            </button>
            <button 
              onClick={togglePlayback}
              className="w-[55px] md:w-[60px] h-[55px] md:h-[60px] rounded-full border-none bg-secondary text-white text-[2rem] md:text-[2.4rem] cursor-pointer transition-all duration-300 grid place-content-center shadow-[0_4px_15px_rgba(142,68,173,0.3)] hover:scale-95 hover:shadow-none"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          </div>
        </div>
        
        <input
          type="text"
          value={timeInput}
          onChange={handleTimeInputChange}
          onFocus={handleTimeInputFocus}
          onBlur={handleTimeInputBlur}
          onKeyDown={handleTimeInputKeyDown}
          placeholder="MM:SS.D"
          maxLength={8}
          className="hidden md:block text-[2rem] font-medium font-mono bg-black/30 py-3 px-6 rounded-[10px] border border-transparent text-white w-[120px] text-center outline-none cursor-text focus:border-white/30 focus:bg-black/40"
        />
      </div>

      <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6 text-center md:text-left w-full md:w-auto">
        <div className="flex justify-between items-center w-full md:w-auto md:block">
          <div className="flex flex-col gap-1 text-left md:text-left">
            <div className="whitespace-nowrap">
              <span className="text-[1.5rem] md:text-[1.6rem] text-white">音楽調: </span>
              <span className="text-[1.5rem] md:text-[1.6rem] font-medium">{audioInfo?.key || '取得できませんでした'}</span>
            </div>
            <div className="whitespace-nowrap">
              <span className="text-[1.5rem] md:text-[1.6rem] text-white">拍/分: </span>
              <span className="text-[1.5rem] md:text-[1.6rem] font-medium">{audioInfo?.tempo || '取得できませんでした'}</span>
            </div>
          </div>
          <div className="whitespace-nowrap md:hidden text-right">
            <span className="text-[1.5rem] text-white">フォーマット: </span>
            <span className="text-[1.5rem] font-medium">mp3</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center md:items-end gap-3 md:gap-6 w-full md:w-auto">
        <div className="hidden md:block">
          <span className="text-[1.6rem] text-white">フォーマット: </span>
          <span className="text-[1.6rem] font-medium">mp3</span>
        </div>
        <div className="flex flex-row md:flex-col items-center gap-3 md:gap-4 w-full md:w-auto">
          <button 
            onClick={resetApp}
            className="flex-1 md:w-full bg-danger border-none rounded-[10px] py-4 md:py-5 px-6 md:px-12 text-[1.5rem] md:text-[1.6rem] font-medium text-white cursor-pointer transition-all duration-300 shadow-[0_4px_15px_rgba(231,76,60,0.3)] hover:translate-y-[2px] hover:shadow-none order-1 md:order-2"
          >
            新しい曲を選択
          </button>
          <button 
            onClick={exportTracks}
            disabled={!canExport}
            className="flex-1 md:w-full bg-success border-none rounded-[10px] py-4 md:py-5 px-6 md:px-12 text-[1.5rem] md:text-[1.6rem] font-medium text-white cursor-pointer transition-all duration-300 shadow-[0_4px_15px_rgba(46,204,113,0.3)] hover:translate-y-[2px] hover:shadow-none disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none order-2 md:order-1"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;