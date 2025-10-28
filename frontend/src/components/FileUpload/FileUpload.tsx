import React, { useRef } from 'react';
import { useAudio } from '../../contexts/AudioContext';

const FileUpload: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAudioFile, state } = useAudio();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAudioFile(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const isProcessing = state.processingStatus.status !== 'idle';

  return (
    <div className="flex flex-col items-center text-center mt-12 md:mt-16">
      <button 
        onClick={handleUploadClick} 
        disabled={isProcessing}
        className="bg-secondary border-none rounded-[15px] py-6 px-12 md:py-10 md:px-20 text-[1.6rem] md:text-[2rem] font-medium text-white cursor-pointer transition-all duration-300 shadow-[0_8px_25px_rgba(142,68,173,0.3)] flex items-center gap-2 md:gap-3 hover:translate-y-[2px] hover:shadow-none disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
      >
        <span className="text-[2rem] md:text-[2.4rem]">📁</span>
        ファイルを選択
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        disabled={isProcessing}
        className="hidden"
      />
      
      {state.currentFile && (
        <div className="mt-4 md:mt-6 p-4 md:p-6 bg-white/10 rounded-[10px] text-[1.2rem] md:text-[1.4rem] text-white max-w-full break-all">
          選択されたファイル: {state.currentFile.name}
          <br />
          サイズ: {(state.currentFile.size / 1024 / 1024).toFixed(2)} MB
        </div>
      )}
    </div>
  );
};

export default FileUpload;

