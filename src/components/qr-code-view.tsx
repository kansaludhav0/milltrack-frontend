import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import QRCode from 'qrcode';

interface QRCodeViewProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

export function QRCodeView({
  value,
  size = 140,
  color = '#0F172A',
  backgroundColor = '#FFFFFF',
}: QRCodeViewProps) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(value, { errorCorrectionLevel: 'M' });
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;

  const moduleCount = qr.modules.size;
  const cellSize = Math.floor(size / moduleCount);
  const actualSize = cellSize * moduleCount;

  const rows: boolean[][] = [];
  for (let r = 0; r < moduleCount; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < moduleCount; c++) {
      row.push(qr.modules.get(r, c) === 1);
    }
    rows.push(row);
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: actualSize,
          height: actualSize,
          backgroundColor,
        },
      ]}>
      {rows.map((row, rIdx) => (
        <View key={rIdx} style={{ flexDirection: 'row', height: cellSize }}>
          {row.map((isDark, cIdx) => (
            <View
              key={cIdx}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: isDark ? color : backgroundColor,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
