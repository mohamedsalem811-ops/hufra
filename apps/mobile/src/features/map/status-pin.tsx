import type { PotholeStatus } from '@hufra/contracts';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/theme/theme-provider';

import { statusColors } from '../reports/status';

const PIN = 'M16 39s13-12.5 13-23A13 13 0 0 0 3 16c0 10.5 13 23 13 23z';
const DARK_GLYPH = '#1A0A04';

/**
 * Map pin from the design: colour plus a glyph per status, so status is never
 * shown by colour alone (brand rule). Orange and amber pins take a dark glyph.
 */
export function StatusPin({ status, size = 32, selected = false }: { status: PotholeStatus; size?: number; selected?: boolean }) {
  const { colors, scheme } = useTheme();
  const fill = statusColors(colors, status).pin;
  const ring = scheme === 'dark' ? colors.bg.canvas : '#FFFFFF';
  const scale = selected ? 1.35 : 1;
  return (
    <Svg width={size * scale} height={size * 1.25 * scale} viewBox="0 0 32 40">
      <Path d={PIN} fill={fill} stroke={ring} strokeWidth={2} />
      <Glyph status={status} light={scheme === 'dark' ? colors.bg.canvas : '#FFFFFF'} fill={fill} />
    </Svg>
  );
}

function Glyph({ status, light, fill }: { status: PotholeStatus; light: string; fill: string }) {
  switch (status) {
    case 'reported':
      return <Path d="M16 9.5v7.5M16 21.5v.5" stroke={DARK_GLYPH} strokeWidth={3} strokeLinecap="round" />;
    case 'verified':
      return (
        <Path
          d="M10.5 16.5l3.5 3.5 7-7"
          fill="none"
          stroke={light}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'under_repair':
      return (
        <>
          <Circle cx={16} cy={16} r={6.5} fill="none" stroke={DARK_GLYPH} strokeWidth={2.5} />
          <Path d="M16 12.5v4l2.5 1.5" fill="none" stroke={DARK_GLYPH} strokeWidth={2.5} strokeLinecap="round" />
        </>
      );
    case 'fixed':
      return (
        <>
          <Circle cx={16} cy={16} r={7.5} fill={light} />
          <Path
            d="M12.5 16.2l2.5 2.5 4.5-4.8"
            fill="none"
            stroke={fill}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
  }
}
