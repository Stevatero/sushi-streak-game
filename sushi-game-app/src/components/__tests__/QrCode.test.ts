import qrcodeGenerator from 'qrcode-generator';
import { qrPath } from '../ui/QrCode';

describe('QrCode', () => {
  it('disegna un modulo scuro per ogni modulo del codice, con il margine bianco standard', () => {
    const link = 'https://sushi.dietalab.net/join/CENA-42';
    const { d, size } = qrPath(link);

    const qr = qrcodeGenerator(0, 'M');
    qr.addData(link);
    qr.make();
    const count = qr.getModuleCount();
    let dark = 0;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) if (qr.isDark(row, col)) dark += 1;
    }

    expect(size).toBe(count + 8);
    expect(d.match(/M/g)).toHaveLength(dark);
    // Il primo modulo scuro (angolo del riquadro di posizione) parte dopo il margine
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});
