import { Directory, File, Paths } from 'expo-file-system';

import type { PickedPhoto } from '../report/photo-pick';

function folderFor(uuid: string): Directory {
  return new Directory(Paths.document, 'outbox', uuid);
}

/** Copies picked photos into the app's documents folder (cache files can be deleted by the system). */
export async function persistPhotos(uuid: string, photos: readonly PickedPhoto[]): Promise<PickedPhoto[]> {
  const folder = folderFor(uuid);
  folder.create({ intermediates: true, idempotent: true });
  const out: PickedPhoto[] = [];
  for (const [i, p] of photos.entries()) {
    const target = new File(folder, `photo-${i + 1}.jpg`);
    if (!target.exists) await new File(p.uri).copy(target);
    out.push({ ...p, uri: target.uri });
  }
  return out;
}

/** Frees the space once the report reached the server (or the person deleted it). */
export function deletePhotos(uuid: string): void {
  try {
    const folder = folderFor(uuid);
    if (folder.exists) folder.delete();
  } catch {
    // Nothing to clean up, or already gone.
  }
}
