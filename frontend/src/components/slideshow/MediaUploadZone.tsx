import { useState, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface MediaUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFileSize?: number;
  acceptedTypes?: string[];
  maxFiles?: number;
}

const DEFAULT_MAX_SIZE = 100 * 1024 * 1024; // 100MB (matches backend hard cap)
const DEFAULT_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/opus',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
];

const MIME_SIZE_LIMITS: Array<{ prefix: string; maxBytes: number }> = [
  { prefix: 'image/', maxBytes: 10 * 1024 * 1024 },
  { prefix: 'audio/', maxBytes: 10 * 1024 * 1024 },
  { prefix: 'video/', maxBytes: 100 * 1024 * 1024 },
  { prefix: 'application/pdf', maxBytes: 25 * 1024 * 1024 },
  { prefix: 'application/msword', maxBytes: 25 * 1024 * 1024 },
  {
    prefix: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    maxBytes: 25 * 1024 * 1024,
  },
  { prefix: 'text/plain', maxBytes: 25 * 1024 * 1024 },
  { prefix: 'application/zip', maxBytes: 25 * 1024 * 1024 },
  { prefix: 'application/x-zip-compressed', maxBytes: 25 * 1024 * 1024 },
];

const maxSizeForFile = (file: File, hardCapBytes: number): number => {
  const fileType = file.type.toLowerCase();
  for (const rule of MIME_SIZE_LIMITS) {
    if (rule.prefix.endsWith('/')) {
      if (fileType.startsWith(rule.prefix)) {
        return Math.min(hardCapBytes, rule.maxBytes);
      }
      continue;
    }
    if (fileType === rule.prefix) {
      return Math.min(hardCapBytes, rule.maxBytes);
    }
  }
  return hardCapBytes;
};

export function MediaUploadZone({
  onFilesSelected,
  maxFileSize = DEFAULT_MAX_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxFiles = 10,
}: MediaUploadZoneProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const perTypeMax = maxSizeForFile(file, maxFileSize);
      if (file.size > perTypeMax) {
        errors.push(
          t('mediaUploadZone.errors.fileTooLarge', {
            name: file.name,
            size: Math.round(perTypeMax / (1024 * 1024)),
          })
        );
        continue;
      }

      if (!acceptedTypes.includes(file.type)) {
        errors.push(t('mediaUploadZone.errors.unsupportedType', { name: file.name }));
        continue;
      }

      valid.push(file);
    }

    if (valid.length + selectedFiles.length > maxFiles) {
      errors.push(t('mediaUploadZone.errors.tooManyFiles', { max: maxFiles }));
      return { valid: valid.slice(0, maxFiles - selectedFiles.length), errors };
    }

    return { valid, errors };
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const { valid, errors: validationErrors } = validateFiles(fileArray);

    setErrors(validationErrors);
    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    handleFiles(e.dataTransfer.files);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length === 0) return;
    onFilesSelected(selectedFiles);
    setSelectedFiles([]);
    setErrors([]);
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setErrors([]);
  };

  return (
    <div className="w-full">
      {/* Upload zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          dragActive
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] bg-opacity-10'
            : 'border-gray-300 hover:border-[var(--color-primary)]'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-[var(--color-primary)]">
              {t('mediaUploadZone.instructions.clickToUpload')}
            </span>{' '}
            {t('mediaUploadZone.instructions.orDragAndDrop')}
          </p>
          <p className="text-xs text-gray-500">
            {t('mediaUploadZone.instructions.summary', {
              size: Math.round(maxFileSize / (1024 * 1024)),
              max: maxFiles,
            })}
          </p>
        </div>
      </div>

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
          {errors.map((error, index) => (
            <p key={index} className="text-sm text-red-600">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              {t('mediaUploadZone.selected.title', { count: selectedFiles.length })}
            </p>
            <button
              onClick={clearAll}
              className="text-sm text-red-600 hover:text-red-700"
            >
              {t('mediaUploadZone.actions.clearAll')}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="relative group bg-gray-100 rounded-lg overflow-hidden aspect-square"
              >
                {/* Preview */}
                {file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={t('common.accessibility.removeFile')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>

                {/* File name tooltip */}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {file.name}
                </div>
              </div>
            ))}
          </div>

          {/* Upload button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleUpload}
              className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              {t('mediaUploadZone.actions.upload', { count: selectedFiles.length })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
