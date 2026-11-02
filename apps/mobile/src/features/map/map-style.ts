import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { API_URL } from '@/config/env';
import type { ColorScheme } from '@/theme/theme';

/**
 * OpenStreetMap raster tiles through our own edge-cached proxy (/tiles), so
 * there is no map key and no cost (plan decision 5). OSM has no dark style,
 * so dark mode dims and desaturates the same tiles.
 */
export function buildMapStyle(scheme: ColorScheme, apiUrl: string = API_URL): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [`${apiUrl}/tiles/{z}/{x}/{y}`],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint:
          scheme === 'dark'
            ? { 'raster-brightness-max': 0.55, 'raster-saturation': -0.45, 'raster-contrast': 0.1 }
            : {},
      },
    ],
  };
}
