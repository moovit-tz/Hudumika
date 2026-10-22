import React, { useState } from 'react';
import { Icon } from './Icon.js';

export interface CarVehicleImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  type?: string | null;
  photoUrl?: string | null;
  view?: '3-4' | 'side' | 'front' | 'rear' | 'top';
  className?: string;
  style?: React.CSSProperties;
  fallbackIcon?: boolean;
}

export const CarVehicleImage: React.FC<CarVehicleImageProps> = ({
  make,
  model,
  year,
  type,
  photoUrl,
  view = '3-4',
  className = '',
  style,
  alt,
  fallbackIcon = true,
  ...rest
}) => {
  const [loadError, setLoadError] = useState(false);

  const cleanMake = make?.trim();
  const cleanModel = model?.trim();
  const cleanYear = year ? String(year).trim() : undefined;
  const cleanPhoto = photoUrl?.trim();

  // If photoUrl is directly provided (e.g. from CarImages signed URL, uploaded image, or local freight image)
  const effectiveSrc = cleanPhoto || '/images/freight/volvo-fh16.jpg';

  if (loadError || !effectiveSrc) {
    if (!fallbackIcon) return null;
    return (
      <div
        className={`car-vehicle-img-fallback ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--card-sunken, #f8fafc)',
          color: 'var(--ink3, #94a3b8)',
          borderRadius: 'var(--r-sm, 6px)',
          width: '100%',
          height: '100%',
          minHeight: 48,
          border: '1px solid var(--border, #e2e8f0)',
          ...style,
        }}
        title={alt || `${cleanMake || 'Fleet'} ${cleanModel || 'Asset'}`}
      >
        <Icon name="truck" size={24} />
      </div>
    );
  }

  return (
    <img
      src={effectiveSrc}
      alt={alt || `${cleanMake || ''} ${cleanModel || 'Vehicle'}`}
      className={`car-vehicle-img ${className}`}
      style={{
        objectFit: 'cover',
        display: 'block',
        ...style,
      }}
      onError={() => setLoadError(true)}
      loading="lazy"
      decoding="async"
      {...rest}
    />
  );
};
