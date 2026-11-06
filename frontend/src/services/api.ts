import axios from 'axios';
import { UploadResponse, StatusResponse } from '../types';
import { API_CONFIG } from '../config/api';

const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
});

export const uploadFile = async (file: File, signal?: AbortSignal): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    signal,
  });
  
  return response.data;
};

export const getStatus = async (jobId: string): Promise<StatusResponse> => {
  const response = await api.get(`/status/${jobId}`);
  return response.data;
};

export const downloadTrack = async (jobId: string, track: string): Promise<Blob> => {
  const response = await api.get(`/download/${jobId}/${track}`, {
    responseType: 'blob',
  });
  return response.data;
};

export const mixTracks = async (jobId: string, volumes: { [key: string]: number }): Promise<{ blob: Blob; filename: string }> => {
  const response = await api.post(`/mix/${jobId}`, { volumes }, {
    responseType: 'blob',
  });
  
  const contentDisposition = response.headers['content-disposition'] || '';
  const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/) || 
                        contentDisposition.match(/filename=["']?([^"';]+)["']?/);
  const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'mixed.wav';
  
  return { blob: response.data, filename };
};

// 分離をキャンセルする。サーバーは分離の区切り（数秒ごと）で処理を止め、途中のデータを削除する
export const cancelJob = async (jobId: string): Promise<void> => {
  await api.post(`/cancel/${jobId}`);
};

// アップロードを途中で中止した場合
export const isCanceledRequest = (error: unknown): boolean => axios.isCancel(error);

// サーバーが再起動してジョブが消えた場合などに 404 が返る
export const isNotFoundError = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 404;

export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await api.get('/health');
    return response.status === 200;
  } catch {
    return false;
  }
};