import React from 'react';
import { TileLayer } from 'react-leaflet';
import { useIsDarkMode } from '../hooks/useIsDarkMode.js';

export type MapVariant = 'light' | 'dark' | 'satellite';

const LIGHT_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIGHT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ArcGIS World Dark Gray Canvas — a crisp dark basemap with zero watermarks
// and no API key requirement, paired with a matching crisp labels overlay.
const DARK_BASE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const DARK_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const DARK_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ';

// Esri World Imagery — free satellite basemap, no API key required.
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/**
 * Drop-in replacement for react-leaflet's <TileLayer>. Defaults to swapping
 * light/dark basemaps by app theme; pass `override` to force a specific
 * variant (e.g. a user-selected satellite view) regardless of theme.
 */
export const MapTileLayer: React.FC<{ override?: MapVariant | null }> = ({ override }) => {
  const isDark = useIsDarkMode();
  const variant: MapVariant = override ?? (isDark ? 'dark' : 'light');

  if (variant === 'satellite') return <TileLayer key="satellite" attribution={SATELLITE_ATTRIBUTION} url={SATELLITE_URL} />;
  if (variant === 'dark') {
    return (
      <React.Fragment key="dark-canvas">
        <TileLayer attribution={DARK_ATTRIBUTION} url={DARK_BASE_URL} />
        <TileLayer url={DARK_LABELS_URL} />
      </React.Fragment>
    );
  }
  return <TileLayer key="light" attribution={LIGHT_ATTRIBUTION} url={LIGHT_URL} />;
};
