// Device-facing helpers of the report flow: photo picking, the draft's
// navigation rules, the permission helpers and keeping photos for offline sending.
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { currentPosition, hasLocationPermission, permissionStates, requestLocation, requestNotifications } from '@/permissions/permissions';

import { deletePhotos, persistPhotos } from '../outbox/files';
import { canContinue, draftReducer, emptyDraft, isDirty, type ReportDraft } from './draft';
import { pickPhotos } from './photo-pick';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 32.88, longitude: 13.19 } })),
  Accuracy: { Balanced: 3, High: 4 },
}));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCameraPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
const mockFiles = new Map<string, boolean>();
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    async copy(target: MockFile) {
      mockFiles.set(target.uri, true);
    }
  }
  class MockDirectory extends MockFile {
    create = jest.fn(() => mockFiles.set(this.uri, true));
    delete = jest.fn(() => {
      for (const k of [...mockFiles.keys()]) if (k.startsWith(this.uri)) mockFiles.delete(k);
    });
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { document: 'file:///docs' } };
});

const asset = (n: number) => ({ uri: `file:///cache/${n}.jpg`, width: 4000, height: 3000 });

describe('pickPhotos', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for the camera only when the camera is used', async () => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({ canceled: false, assets: [asset(1)] } as never);
    expect(await pickPhotos('camera', 3)).toEqual({ kind: 'picked', photos: [{ uri: 'file:///cache/1.jpg', width: 4000, height: 3000 }] });
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(jest.mocked(ImagePicker.launchCameraAsync).mock.calls[0][0]).toMatchObject({ allowsMultipleSelection: false, exif: false });

    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [asset(1), asset(2), asset(3)] } as never);
    const gallery = await pickPhotos('gallery', 2);
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(jest.mocked(ImagePicker.launchImageLibraryAsync).mock.calls[0][0]).toMatchObject({ allowsMultipleSelection: true, selectionLimit: 2 });
    // Never more than the room left, even if the picker returns more.
    expect(gallery.kind === 'picked' && gallery.photos).toHaveLength(2);
  });

  it('reports a refused camera, a cancelled pick and a picker failure', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await pickPhotos('camera', 3)).toEqual({ kind: 'denied' });
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null } as never);
    expect(await pickPhotos('gallery', 3)).toEqual({ kind: 'cancelled' });
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockRejectedValueOnce(new Error('no activity'));
    expect(await pickPhotos('gallery', 3)).toEqual({ kind: 'denied' });
  });
});

describe('draft navigation', () => {
  const ready: ReportDraft = {
    ...emptyDraft,
    location: { latitude: 32.9, longitude: 13.2, accuracy: 8 },
    photos: [asset(1)],
    severity: 'medium',
  };

  it('moves forward only when a step is complete, and back freely', () => {
    let d = draftReducer({ ...ready, step: 'photos' }, { type: 'next' });
    expect(d.step).toBe('details');
    d = draftReducer(d, { type: 'next' });
    expect(d.step).toBe('review');
    expect(draftReducer(d, { type: 'next' }).step).toBe('review');
    d = draftReducer(d, { type: 'back' });
    expect(d.step).toBe('details');
    expect(draftReducer({ ...emptyDraft }, { type: 'back' }).step).toBe('location');
    expect(draftReducer(d, { type: 'goto', step: 'photos' }).step).toBe('photos');
  });

  it('checks every step before review and the text limits', () => {
    expect(canContinue({ ...ready, step: 'review' })).toBe(true);
    expect(canContinue({ ...ready, photos: [], step: 'review' })).toBe(false);
    expect(canContinue({ ...ready, description: 'x'.repeat(1001) }, 'details')).toBe(false);
  });

  it('removes a photo and knows when there is something to lose', () => {
    const d = draftReducer({ ...emptyDraft, photos: [asset(1), asset(2)] }, { type: 'removePhoto', index: 0 });
    expect(d.photos.map((p) => p.uri)).toEqual(['file:///cache/2.jpg']);
    expect(isDirty(emptyDraft)).toBe(false);
    expect(isDirty({ ...emptyDraft, description: '  ' })).toBe(false);
    expect(isDirty({ ...emptyDraft, depthCm: '5' })).toBe(true);
  });
});

describe('permissions', () => {
  it('maps the answers and never throws', async () => {
    expect(await requestLocation()).toBe('granted');
    jest.mocked(Location.requestForegroundPermissionsAsync).mockRejectedValueOnce(new Error('x'));
    expect(await requestLocation()).toBe('undetermined');
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await requestNotifications()).toBe('denied');
    expect(await hasLocationPermission()).toBe(true);
    expect(await permissionStates()).toEqual({ location: 'granted', camera: 'denied', notifications: 'undetermined' });
  });

  it('uses a recent position, else asks for a fresh one, else gives up quietly', async () => {
    expect(await currentPosition()).toEqual({ latitude: 32.88, longitude: 13.19 });
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce({ coords: { latitude: 1, longitude: 2 } } as never);
    expect(await currentPosition()).toEqual({ latitude: 1, longitude: 2 });
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(new Error('no fix'));
    expect(await currentPosition()).toBeNull();
  });
});

describe('outbox photo files', () => {
  it('copies photos into the documents folder once, and deletes them after sending', async () => {
    mockFiles.clear();
    const kept = await persistPhotos('abc', [asset(1), asset(2)]);
    expect(kept.map((p) => p.uri)).toEqual(['file:///docs/outbox/abc/photo-1.jpg', 'file:///docs/outbox/abc/photo-2.jpg']);
    // A retry finds them already there.
    expect(await persistPhotos('abc', [asset(1)])).toEqual([kept[0]]);
    deletePhotos('abc');
    expect([...mockFiles.keys()].some((k) => k.includes('/abc'))).toBe(false);
    expect(() => deletePhotos('missing')).not.toThrow();
  });
});
