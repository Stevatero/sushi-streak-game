import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcodeGenerator from 'qrcode-generator';
import { radii } from '../../theme/theme';

interface QrCodeProps {
  value: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// Margine bianco attorno al codice (in moduli, 4 come da standard): serve ai lettori per riconoscerlo
const QUIET_ZONE = 4;

// Percorso SVG con un quadrato per ogni modulo scuro: un solo elemento da disegnare
export function qrPath(value: string) {
  const qr = qrcodeGenerator(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { d, size: count + QUIET_ZONE * 2 };
}

// Codice QR sempre scuro su bianco, anche nel tema scuro: è il contrasto che le fotocamere leggono meglio
const QrCode: React.FC<QrCodeProps> = ({ value, size = 180, style, accessibilityLabel }) => {
  const { d, size: modules } = useMemo(() => qrPath(value), [value]);
  return (
    <View
      style={[styles.frame, { width: size, height: size }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Codice QR'}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`}>
        <Rect x={0} y={0} width={modules} height={modules} fill="#FFFFFF" />
        <Path d={d} fill="#1D1A17" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
});

export default QrCode;
