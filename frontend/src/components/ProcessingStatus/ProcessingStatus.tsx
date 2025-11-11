import React, { useEffect, useState } from 'react';
import { useAudio } from '../../contexts/AudioContext';

const ProcessingStatus: React.FC = () => {
  const { state } = useAudio();
  const { processingStatus } = state;
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const targetProgress = processingStatus.progress;
    
    if (displayProgress < targetProgress) {
      const timer = setInterval(() => {
        setDisplayProgress(prev => {
          const next = prev + 1;
          if (next >= targetProgress) {
            clearInterval(timer);
            return targetProgress;
          }
          return next;
        });
      }, 20);
      
      return () => clearInterval(timer);
    } else if (displayProgress > targetProgress) {
      setDisplayProgress(targetProgress);
    }
  }, [processingStatus.progress, displayProgress]);

  if (processingStatus.status === 'idle' || processingStatus.status === 'completed') {
    return null;
  }

  const isError = processingStatus.status === 'error';
  
  const circumference = 2 * Math.PI * 56;
  const strokeDashoffset = circumference * (1 - displayProgress / 100);

  return (
    <div className="grid place-content-center text-center mt-[150px]">
      <div className="w-[100px] md:w-[120px] h-[100px] md:h-[120px] relative mx-auto mb-8 md:mb-12">
        <svg 
          className="rotate-[-90deg] w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
          viewBox="0 0 120 120"
        >
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <circle
            cx="60"
            cy="60"
            r="56"
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r="56"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <span className="text-[2.4rem] md:text-[2.8rem] font-bold text-white">
            {Math.round(displayProgress)}
            <span className="text-[1.6rem] md:text-[2rem] font-bold text-white">%</span>
          </span>
        </div>
      </div>
      
      {isError ? (
        <div className="bg-danger/20 border border-danger/30 rounded-[10px] p-4 md:p-6 text-danger mt-4 md:mt-6 text-[1.5rem] md:text-[1.6rem]">
          <strong>エラーが発生しました</strong>
          <br />
          {processingStatus.error || '不明なエラーが発生しました'}
        </div>
      ) : (
        <p className="text-[1.4rem] md:text-[1.8rem] font-light m-0 mb-4 md:mb-6 animate-pulse px-4">
          {processingStatus.message}
        </p>
      )}
    </div>
  );
};

export default ProcessingStatus;