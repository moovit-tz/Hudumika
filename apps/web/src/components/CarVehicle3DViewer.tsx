import React from 'react';

export interface CarVehicle3DViewerProps {
  make: string;
  model: string;
  year?: number | string;
  modelUrl?: string | null;
  backdrop?: 'light' | 'graphite' | 'dark' | 'slate' | 'sand' | 'sky' | 'mint' | 'black';
  autoRotate?: boolean;
  className?: string;
  style?: React.CSSProperties;
  height?: number | string;
}

export const CarVehicle3DViewer: React.FC<CarVehicle3DViewerProps> = ({
  make,
  model,
  year,
  modelUrl,
  backdrop = 'graphite',
  autoRotate = true,
  className = '',
  style,
  height = 360,
}) => {
  const modelViewerProps: Record<string, any> = {
    'data-ci-make': make.trim(),
    'data-ci-model': model.trim(),
    'data-ci-year': year ? String(year).trim() : undefined,
    'data-ci-backdrop': backdrop,
    src: modelUrl || undefined,
    'camera-controls': true,
    'auto-rotate': autoRotate ? true : undefined,
    'shadow-intensity': '1.1',
    exposure: '1.0',
    style: {
      width: '100%',
      height: '100%',
      display: 'block',
    },
  };

  return (
    <div
      className={`car-vehicle-3d-wrapper ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 'var(--r, 8px)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      {React.createElement('model-viewer', modelViewerProps)}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          padding: '4px 8px',
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          borderRadius: 'var(--r-sm)',
          fontSize: 10.5,
          fontWeight: 600,
          color: '#ffffff',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>3D Interactive</span>
        <span style={{ opacity: 0.6 }}>•</span>
        <span>Drag to rotate</span>
      </div>
    </div>
  );
};
