import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useAudio } from '../../contexts/AudioContext';

const ProcessingContainer = styled.div`
  display: grid;
  place-content: center;
  min-height: 400px;
  text-align: center;
`;

const ProgressCircle = styled.div`
  width: 120px;
  height: 120px;
  position: relative;
  margin: 0 auto 3.2rem;
`;

const SVGCircle = styled.svg`
  transform: rotate(-90deg);
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.6));
`;

const CircleBackground = styled.circle`
  fill: none;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 8;
`;

const CircleProgress = styled.circle<{ $progress: number }>`
  fill: none;
  stroke: url(#gradient);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: ${2 * Math.PI * 56};
  stroke-dashoffset: ${props => 2 * Math.PI * 56 * (1 - props.$progress / 100)};
  transition: stroke-dashoffset 0.3s ease;
`;

const ProgressTextContainer = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
`;

const ProgressText = styled.span`
  font-size: 2.8rem;
  font-weight: 700;
  color: #ffffff;
`;

const PercentSymbol = styled.span`
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
`;

const ProcessingText = styled.p`
  font-size: 1.8rem;
  font-weight: 300;
  margin: 0 0 1.6rem;
`;

const pulse = keyframes`
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
`;

const AnimatedText = styled(ProcessingText)`
  animation: ${pulse} 2s infinite;
`;

const ErrorMessage = styled.div`
  background: rgba(231, 76, 60, 0.2);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 10px;
  padding: 1.6rem;
  color: #e74c3c;
  margin: 1.6rem 0 0;
`;

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

  return (
    <ProcessingContainer>
      <ProgressCircle>
        <SVGCircle>
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <CircleBackground
            cx="60"
            cy="60"
            r="56"
          />
          <CircleProgress
            cx="60"
            cy="60"
            r="56"
            $progress={displayProgress}
          />
        </SVGCircle>
        <ProgressTextContainer>
          <ProgressText>
            {Math.round(displayProgress)}
            <PercentSymbol>%</PercentSymbol>
          </ProgressText>
        </ProgressTextContainer>
      </ProgressCircle>
      
      {isError ? (
        <ErrorMessage>
          <strong>エラーが発生しました</strong>
          <br />
          {processingStatus.error || '不明なエラーが発生しました'}
        </ErrorMessage>
      ) : (
        <AnimatedText>{processingStatus.message}</AnimatedText>
      )}
    </ProcessingContainer>
  );
};

export default ProcessingStatus;