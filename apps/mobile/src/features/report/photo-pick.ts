import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

export type PickResult = { kind: 'picked'; photos: PickedPhoto[] } | { kind: 'cancelled' } | { kind: 'denied' };

/** Camera or gallery. The camera permission is asked here, at the moment it is needed. */
export async function pickPhotos(source: 'camera' | 'gallery', remaining: number): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return { kind: 'denied' };
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
      allowsMultipleSelection: source === 'gallery' && remaining > 1,
      selectionLimit: remaining,
    };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return { kind: 'cancelled' };
    return {
      kind: 'picked',
      photos: result.assets.slice(0, remaining).map((a) => ({ uri: a.uri, width: a.width, height: a.height })),
    };
  } catch {
    return { kind: 'denied' };
  }
}
