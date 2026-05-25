// ─────────────────────────────────────────────────────────────────────────────
// lib/storage/maintenance-photos.ts
//
// Helper for uploading photos attached to a maintenance request. Files go
// into the public Storage bucket `maintenance-photos` and a row is also
// inserted into the `maintenance_photos` table so we can query without
// listing the bucket.
//
// Path layout:
//   maintenance-photos/{request_id}/{timestamp}-{photo_type}.{ext}
//
// Bucket setup: in Supabase Dashboard → Storage create a public bucket
// called `maintenance-photos` (Public access ON, file size limit 10 MB).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";

export type PhotoType = "before" | "during" | "after";

export interface UploadResult {
  url:   string;
  path:  string;
}

export async function uploadMaintenancePhoto(
  requestId: string,
  file:      File,
  photoType: PhotoType = "before"
): Promise<UploadResult | null> {
  const ext      = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${requestId}/${Date.now()}-${photoType}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("maintenance-photos")
    .upload(filename, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    console.error("Photo upload failed:", uploadError);
    return null;
  }

  const { data: pub } = supabase.storage
    .from("maintenance-photos")
    .getPublicUrl(filename);

  const publicUrl = pub.publicUrl;

  const { error: insertError } = await supabase
    .from("maintenance_photos")
    .insert({
      request_id: requestId,
      photo_url:  publicUrl,
      photo_type: photoType,
    });

  if (insertError) {
    console.error("Photo metadata insert failed:", insertError);
    // The file is uploaded but the DB row failed. Return URL anyway —
    // the file exists, just not indexed. Caller can retry the metadata.
  }

  return { url: publicUrl, path: filename };
}

export async function uploadMaintenancePhotos(
  requestId: string,
  files:     File[],
  photoType: PhotoType = "before"
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const file of files) {
    const r = await uploadMaintenancePhoto(requestId, file, photoType);
    if (r) results.push(r);
  }
  return results;
}
