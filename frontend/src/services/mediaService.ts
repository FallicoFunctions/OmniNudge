import api from './api';

export interface MediaFile {
  id: number;
  user_id: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  thumbnail_url?: string;
  storage_path: string;
  width?: number;
  height?: number;
  duration?: number;
  used_in_message_id?: number;
  uploaded_at: string;
}

export const mediaService = {
  async uploadMedia(file: File): Promise<MediaFile> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<MediaFile>('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },
};
