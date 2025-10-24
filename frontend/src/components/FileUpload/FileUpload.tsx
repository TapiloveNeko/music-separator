import React, { useRef } from 'react';
import styled from 'styled-components';
import { useAudio } from '../../contexts/AudioContext';

const UploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
`;

const UploadButton = styled.button`
  background-color: #8e44ad;
  border: none;
  border-radius: 15px;
  padding: 2.4rem 4.8rem;
  font-size: 2rem;
  font-weight: 500;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 8px 25px rgba(142, 68, 173, 0.3);
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0 auto;

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

const UploadIcon = styled.span`
  font-size: 2.4rem;
`;

const FileInput = styled.input`
  display: none;
`;

const FileInfo = styled.div`
  margin-top: 1.6rem;
  padding: 1.6rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 1.4rem;
  color: #ffffff;
`;

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
    <UploadContainer>
      <UploadButton onClick={handleUploadClick} disabled={isProcessing}>
        <UploadIcon>📁</UploadIcon>
        ファイルを選択
      </UploadButton>
      
      <FileInput
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        disabled={isProcessing}
      />
      
      {state.currentFile && (
        <FileInfo>
          選択されたファイル: {state.currentFile.name}
          <br />
          サイズ: {(state.currentFile.size / 1024 / 1024).toFixed(2)} MB
        </FileInfo>
      )}
    </UploadContainer>
  );
};

export default FileUpload;

