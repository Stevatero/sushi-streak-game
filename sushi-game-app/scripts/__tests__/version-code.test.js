const { versionCode } = require('../version-code');

describe('versionCode', () => {
  it('cresce con la versione SemVer', () => {
    expect(versionCode('1.2.0')).toBe(10200);
    expect(versionCode('1.3.0')).toBe(10300);
    expect(versionCode('1.3.1')).toBeGreaterThan(versionCode('1.3.0'));
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'));
  });

  it('rifiuta versioni non valide', () => {
    expect(() => versionCode('abc')).toThrow();
    expect(() => versionCode('1.100.0')).toThrow();
  });
});
