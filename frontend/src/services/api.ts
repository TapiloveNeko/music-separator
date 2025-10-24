import axios from 'axios';
import { UploadResponse, StatusResponse } from '../types';
import { API_CONFIG } from '../config/api';

const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
});

export const uploadFile = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
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

export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await api.get('/health');
    return response.status === 200;
  } catch {
    return false;
  }
};
