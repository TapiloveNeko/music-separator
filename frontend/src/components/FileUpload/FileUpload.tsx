import React, { useRef, useState, useEffect } from 'react';
import { useAudio } from '../../contexts/AudioContext';

const FileUpload: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAudioFile, state } = useAudio();
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAudioFile(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const isAudio = file.type.includes('audio') || file.type.includes('video') || file.name.match(/\.(wav|mp3|m4a|flac|ogg|aac|mp4)$/i);
      if (!isAudio) {
        alert('音声ファイル（WAV、MP3、M4A、FLAC、OGG、AAC、MP4）をアップロードしてください。');
        return;
      }
      uploadAudioFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const isProcessing = state.processingStatus.status !== 'idle';

  return (
    <>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={handleUploadClick}
        className={`hidden md:block md:mt-12 w-[550px] mx-auto border-2 border-dashed rounded-[15px] p-8 md:p-16 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-white/80 bg-white/10'
            : 'border-white/30 hover:border-white/60 hover:bg-white/5'
        } ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="text-6xl md:text-8xl mb-4">🎼</div>
        <p className="text-white text-[1.5rem] md:text-[1.8rem] mb-2 font-medium">
          {isDragging ? 'ここにドロップしてください' : 'クリックまたはドラッグ&ドロップでファイルを選択'}
        </p>
        <p className="text-white/50 text-[1.2rem] md:text-[1.4rem]">
          音声ファイル（MP3 / MP4 / M4A / AAC / WAV / FLAC / OGG 対応）
        </p>
      </div>

      <button 
        onClick={handleUploadClick} 
        disabled={isProcessing}
        className="md:hidden mt-12 bg-secondary border-none rounded-[15px] py-8 px-16 text-[1.8rem] font-medium text-white cursor-pointer transition-all duration-300 shadow-[0_8px_25px_rgba(142,68,173,0.3)] flex items-center gap-2 hover:translate-y-[2px] hover:shadow-none disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
      >
        <span className="text-[2rem]">📁</span>
        ファイルを選択
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4"
        onChange={handleFileSelect}
        disabled={isProcessing}
        className="hidden"
      />
      
      {state.currentFile && (
        <div className="mt-4 md:mt-6 p-4 md:p-6 bg-white/10 rounded-[10px] text-[1.5rem] md:text-[1.6rem] text-white max-w-full break-all">
          選択されたファイル: {state.currentFile.name}
          <br />
          サイズ: {(state.currentFile.size / 1024 / 1024).toFixed(2)} MB
        </div>
      )}
    </>
  );
};

export default FileUpload;