/* eslint-disable @typescript-eslint/no-require-imports */
// Segnalazioni di errore: solo con il consenso, una volta per errore, gli errori fatali al riavvio.
import AsyncStorage from '@react-native-async-storage/async-storage';

type CrashModule = typeof import('../crashReporter');
type LoggerModule = typeof import('../../utils/logger');

// Moduli ricaricati a ogni test: lo stato (consenso, errori già inviati) vive nel modulo
function load() {
  let crash!: CrashModule;
  let log!: LoggerModule;
  jest.isolateModules(() => {
    crash = require('../crashReporter');
    log = require('../../utils/logger');
  });
  return { crash, logger: log.logger };
}

const fetchMock = jest.fn();
const sentReports = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

describe('crashReporter', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 202 });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('senza consenso non invia nulla', async () => {
    const { crash, logger } = load();
    await crash.initCrashReporting();
    logger.error('Qualcosa non va', new Error('boom'));
    expect(crash.isCrashReportingEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con il consenso invia versione, sistema ed errore, una volta sola per errore', async () => {
    const { crash, logger } = load();
    await crash.initCrashReporting();
    crash.setCrashReportingEnabled(true);

    logger.error('Salvataggio non riuscito', new TypeError('x is undefined'));
    logger.error('Salvataggio non riuscito', new TypeError('x is undefined'));
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/crash-reports$/);
    expect(sentReports()[0]).toMatchObject({
      name: 'TypeError',
      message: 'x is undefined',
      context: 'Salvataggio non riuscito',
      fatal: false,
      platform: expect.any(String),
      appVersion: expect.any(String),
    });
    expect(await AsyncStorage.getItem('pref_crash_reports')).toBe('true');
  });

  it('un errore fatale salvato viene inviato al riavvio e poi cancellato', async () => {
    const { crash } = load();
    await AsyncStorage.setItem('pref_crash_reports', 'true');
    const report = crash.buildCrashReport(new Error('crash'), true, 'Errore fatale');
    await AsyncStorage.setItem('pending_crash_report', JSON.stringify(report));

    await crash.initCrashReporting();
    expect(sentReports()).toEqual([expect.objectContaining({ message: 'crash', fatal: true })]);
    expect(await AsyncStorage.getItem('pending_crash_report')).toBeNull();
  });

  it('offline la segnalazione fatale resta per il prossimo avvio', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'));
    const { crash } = load();
    await AsyncStorage.setItem('pref_crash_reports', 'true');
    await AsyncStorage.setItem(
      'pending_crash_report',
      JSON.stringify(crash.buildCrashReport(new Error('crash'), true))
    );
    await crash.initCrashReporting();
    expect(await AsyncStorage.getItem('pending_crash_report')).not.toBeNull();
  });

  it('disattivandole si cancella anche la segnalazione in attesa', async () => {
    const { crash } = load();
    await AsyncStorage.setItem('pending_crash_report', '{}');
    crash.setCrashReportingEnabled(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('pending_crash_report')).toBeNull();
    expect(await AsyncStorage.getItem('pref_crash_reports')).toBe('false');
  });
});
