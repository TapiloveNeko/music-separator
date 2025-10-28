import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useAudio } from '../../contexts/AudioContext';

const PlayerContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 3.2rem;
  margin: 3.2rem 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3.2rem 0 0;
`;

const PlaybackControls = styled.div`
  display: flex;
  gap: 1.6rem;
  align-items: center;
`;

const ControlButton = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background-color: #8e44ad;
  color: #ffffff;
  font-size: 2rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: grid;
  place-content: center;
  box-shadow: 0 4px 15px rgba(142, 68, 173, 0.3);

  &:hover {
    transform: scale(0.95);
    box-shadow: none;
  }

  &.play-button {
    width: 60px;
    height: 60px;
    font-size: 2.4rem;
  }
`;

const TimeDisplay = styled.input`
  font-size: 2rem;
  font-weight: 500;
  font-family: 'Courier New', monospace;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.8rem 1.6rem;
  border-radius: 10px;
  border: 1px solid transparent;
  color: #ffffff;
  width: 120px;
  text-align: center;
  outline: none;
  cursor: text;

  &:focus {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(0, 0, 0, 0.4);
  }
`;

const MusicInfo = styled.div``;

const InfoLabel = styled.span`
  font-size: 1.4rem;
  color: #ffffff;
`;

const InfoValue = styled.span`
  font-size: 1.4rem;
  font-weight: 500;
`;

const ExportSection = styled.div`
  display: grid;
  justify-items: end;
  gap: 1.6rem;
`;

const FormatLabel = styled.span`
  font-size: 1.4rem;
  color: #ffffff;
`;

const FormatValue = styled.span`
  font-size: 1.4rem;
  font-weight: 500;
`;

const ExportButton = styled.button`
  background-color: #2ecc71;
  border: none;
  border-radius: 10px;
  padding: 1.2rem 3.2rem;
  font-size: 1.6rem;
  font-weight: 500;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(46, 204, 113, 0.3);

  &:hover {
    transform: translateY(2px);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const ResetButton = styled.button`
  background-color: #e74c3c;
  border: none;
  border-radius: 10px;
  padding: 1.2rem 3.2rem;
  font-size: 1.6rem;
  font-weight: 500;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);

  &:hover {
    transform: translateY(2px);
    box-shadow: none;
  }
`;

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
    <PlayerContainer>
      <PlaybackControls>
        <ControlButton onClick={handleResetToStart}>
          ⏮
        </ControlButton>
        <ControlButton 
          className="play-button" 
          onClick={togglePlayback}
        >
          {isPlaying ? '⏸' : '▶'}
        </ControlButton>
      </PlaybackControls>
      
      <TimeDisplay
        type="text"
        value={timeInput}
        onChange={handleTimeInputChange}
        onFocus={handleTimeInputFocus}
        onBlur={handleTimeInputBlur}
        onKeyDown={handleTimeInputKeyDown}
        placeholder="MM:SS.D"
        maxLength={8}
      />

      <MusicInfo>
        <div>
          <InfoLabel>音楽調: </InfoLabel>
          <InfoValue>{audioInfo?.key || '取得できませんでした'}</InfoValue>
        </div>
        <div>
          <InfoLabel>拍/分: </InfoLabel>
          <InfoValue>{audioInfo?.tempo || '取得できませんでした'}</InfoValue>
        </div>
      </MusicInfo>

      <ExportSection>
        <div>
          <FormatLabel>フォーマット: </FormatLabel>
          <FormatValue>mp3</FormatValue>
        </div>
        <ExportButton 
          onClick={exportTracks}
          disabled={!canExport}
        >
          保存
        </ExportButton>
        <ResetButton onClick={resetApp}>
          新しい曲を選択
        </ResetButton>
      </ExportSection>
    </PlayerContainer>
  );
};

export default AudioPlayer;