import { useState, useRef } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { uploadFile } from '../lib/api';

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
  /** Show a round/square preview. Default: 'square' */
  shape?: 'round' | 'square';
  /** Preview size class. Default: 'w-20 h-20' */
  previewSize?: string;
}

export default function ImageUpload({
  value,
  onChange,
  label,
  className = '',
  shape = 'square',
  previewSize = 'w-20 h-20',
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5 MB)');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const result = await uploadFile(file);
      onChange(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const roundCls = shape === 'round' ? 'rounded-full' : 'rounded-xl';

  return (
    <div className={className}>
      {label && (
        <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      <div className="flex items-center gap-4">
        {/* Preview */}
        {value ? (
          <div className={`relative group ${previewSize} shrink-0`}>
            <img
              src={value}
              alt="Preview"
              className={`${previewSize} ${roundCls} object-cover ring-2 ring-white/10`}
            />
            <button
              type="button"
              onClick={() => onChange('')}
              className={`absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 ${shape === 'round' ? 'rounded-full' : 'rounded-md'} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ) : (
          <div
            className={`${previewSize} ${roundCls} bg-white/5 border border-dashed border-white/20 flex items-center justify-center shrink-0`}
          >
            <ImageIcon className="w-6 h-6 text-gray-blue/40" />
          </div>
        )}

        {/* Upload area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex-1 border border-dashed rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all ${
            dragOver
              ? 'border-sand/60 bg-sand/10'
              : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'
          }`}
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-sand animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-gray-blue/60" />
          )}
          <div className="text-sm">
            {uploading ? (
              <span className="text-sand">Uploading...</span>
            ) : (
              <>
                <span className="text-white/70">Click to upload</span>
                <span className="text-gray-blue/50"> or drag & drop</span>
                <p className="text-[11px] text-gray-blue/40 mt-0.5">JPG, PNG, GIF, WEBP (max 5 MB)</p>
              </>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
    </div>
  );
}
