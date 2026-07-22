import React from 'react';
import { TileLayer } from 'react-leaflet';
import { useIsDarkMode } from '../hooks/useIsDarkMode.js';

export type MapVariant = 'light' | 'dark' | 'satellite';

const LIGHT_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIGHT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// CartoDB's free dark basemap — a genuinely dark-styled tile set (not a CSS
// filter over light tiles), matching the clean dark map look used across
// modern fleet dashboards.
const DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
  if (variant === 'dark') return <TileLayer key="dark" attribution={DARK_ATTRIBUTION} url={DARK_URL} />;
  return <TileLayer key="light" attribution={LIGHT_ATTRIBUTION} url={LIGHT_URL} />;
};
