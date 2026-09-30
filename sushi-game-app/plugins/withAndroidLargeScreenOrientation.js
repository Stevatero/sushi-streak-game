/**
 * Config plugin: toglie da MainActivity il blocco verticale (android:screenOrientation) generato da
 * `orientation: 'portrait'`, che resta valido per iOS.
 *
 * Google Play segnala i blocchi di orientamento nel manifest perché impediscono l'uso sugli schermi
 * grandi (tablet, pieghevoli aperti), dove da Android 16 vengono comunque ignorati. Sui telefoni il
 * verticale è bloccato durante l'esecuzione (vedi src/hooks/usePhonePortraitLock.ts).
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidLargeScreenOrientation(config) {
  return withAndroidManifest(config, (cfg) => {
    const activities = cfg.modResults.manifest.application?.[0]?.activity ?? [];
    const main = activities.find((a) => a.$?.['android:name'] === '.MainActivity');
    if (main) delete main.$['android:screenOrientation'];
    return cfg;
  });
};
