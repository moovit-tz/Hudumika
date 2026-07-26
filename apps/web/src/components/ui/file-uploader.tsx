import React, { useCallback, useState } from 'react';
import { Icon } from '../Icon.js';
import { cn } from '@/lib/utils.js';
import { Button } from './button.js';

interface FileUploaderProps {
  onUpload: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  className?: string;
  uploadingFiles?: { id: string; name: string; size: number; progress: number; status: 'uploading' | 'completed' | 'error' }[];
  onRemoveFile?: (id: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onUpload,
  accept,
  multiple = true,
  maxSize,
  className,
  uploadingFiles = [],
  onRemoveFile,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      // Optional: Add size/type filtering here based on props
      onUpload(files);
    }
  }, [onUpload]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onUpload(files);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Dropzone */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all duration-200 bg-muted/50",
          isDragging ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/40 hover:bg-muted"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
        />
        <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-card shadow-sm flex items-center justify-center border border-border text-primary">
            <Icon name="upload-cloud" size={24} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Click or drag files here to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports CSV, XLS, PDF up to {maxSize ? `${Math.round(maxSize / 1024 / 1024)}MB` : '50MB'}
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {uploadingFiles.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          {uploadingFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon name="file" size={20} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-foreground truncate pr-4">{file.name}</p>
                  <p className="text-xs font-medium text-muted-foreground shrink-0">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                {file.status === 'uploading' ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-primary w-8 text-right">{file.progress}%</span>
                  </div>
                ) : file.status === 'completed' ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Icon name="check-circle" size={14} /> Completed
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    <Icon name="alert-circle" size={14} /> Failed
                  </div>
                )}
              </div>

              {onRemoveFile && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(file.id)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors shrink-0"
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
