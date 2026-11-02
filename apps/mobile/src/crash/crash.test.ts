import { Platform } from 'react-native';

const mockRecordError = jest.fn();
const mockLog = jest.fn();
let mockApps: unknown[] = [];
jest.mock('@react-native-firebase/app', () => ({ getApps: () => mockApps }));
jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: () => 'instance',
  recordError: (...a: unknown[]) => mockRecordError(...a),
  log: (...a: unknown[]) => mockLog(...a),
}));

const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
const original = Platform.OS;
afterEach(() => setOS(original));

/** A fresh copy of the module (it remembers whether Firebase is there). */
function load(): typeof import('./crash') {
  let mod!: typeof import('./crash');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./crash');
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApps = [];
});

describe('crash reporting', () => {
  it('sends caught errors with context on Android when Firebase is configured', () => {
    setOS('android');
    mockApps = [{ name: '[DEFAULT]' }];
    const { reportError, breadcrumb } = load();
    breadcrumb('screen /map');
    reportError(new Error('boom'), 'crash screen shown');
    expect(mockLog).toHaveBeenCalledWith('instance', 'screen /map');
    expect(mockLog).toHaveBeenCalledWith('instance', 'crash screen shown');
    expect(mockRecordError).toHaveBeenCalledWith('instance', expect.objectContaining({ message: 'boom' }));
  });

  it('turns non-errors into errors', () => {
    setOS('android');
    mockApps = [{}];
    load().reportError('plain text');
    expect(mockRecordError).toHaveBeenCalledWith('instance', expect.objectContaining({ message: 'plain text' }));
  });

  it('does nothing without Firebase or on iPhone', () => {
    setOS('android');
    load().reportError(new Error('no firebase'));
    setOS('ios');
    mockApps = [{}];
    load().reportError(new Error('iphone'));
    expect(mockRecordError).not.toHaveBeenCalled();
  });
});
