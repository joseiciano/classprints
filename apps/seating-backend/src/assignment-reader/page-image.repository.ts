import type { ImagesBinding, R2Bucket } from '@cloudflare/workers-types';
import type { DocumentType, ImageVariant, Rotation } from '@classprints/assignment-reader-shared';

/**
 * Page image repository (TASK-010/TASK-012): all R2 + Images-binding
 * operations for canonical page storage and authenticated variant delivery.
 * `assignment-reader.service.ts` owns orchestration (ownership, state,
 * revisions); this module owns byte-level validation, normalization,
 * storage, and transform. Nothing here touches Postgres.
 */

/** Thrown when the uploaded bytes are not a supported image at all
 * (wrong/spoofed signature, or an unsupported decoded format such as SVG). */
export class UnsupportedImageError extends Error {}

/** Thrown when the bytes look like a supported image by signature but fail
 * to decode (truncated/corrupt data). */
export class MalformedImageError extends Error {}

/** REQ-007: one non-empty `file` field, at most 10,000,000 bytes. */
export const MAX_UPLOAD_BYTES = 10_000_000;

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** ISO-BMFF `ftyp` brands accepted as HEIC/HEIF. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1']);

const matchesMagic = (bytes: Uint8Array, magic: number[]): boolean =>
  magic.every((byte, index) => bytes[index] === byte);

/** Byte-signature sniff only; the Images binding decode is the real
 * malformed/spoof-proof gate (SEC-001 upload hardening). */
export const sniffImageSignature = (
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/heic' | null => {
  if (matchesMagic(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (matchesMagic(bytes, PNG_MAGIC)) return 'image/png';
  if (bytes.length >= 12) {
    const boxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (boxType === 'ftyp' && HEIC_BRANDS.has(brand)) return 'image/heic';
  }
  return null;
};

export interface StorageKeyInput {
  teacherId: string;
  classId: string;
  assignmentId: string;
  documentType: DocumentType;
  pageId: string;
}

/** REQ-020 key: teacher/{t}/class/{c}/assignment/{a}/{type}/{pageId}.jpg. */
export const storageKeyFor = ({
  teacherId,
  classId,
  assignmentId,
  documentType,
  pageId,
}: StorageKeyInput): string =>
  `teacher/${teacherId}/class/${classId}/assignment/${assignmentId}/${documentType}/${pageId}.jpg`;

export interface RegionCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Converts a normalized [0,1] region (validated against the canonical
 * unrotated image) into a clamped pixel box. Exported for unit testing in
 * isolation from the Images binding. */
export const regionToPixelBox = (
  region: RegionCrop,
  canonicalWidth: number,
  canonicalHeight: number,
): { left: number; top: number; width: number; height: number } => {
  const left = Math.min(Math.max(Math.round(region.x * canonicalWidth), 0), Math.max(canonicalWidth - 1, 0));
  const top = Math.min(Math.max(Math.round(region.y * canonicalHeight), 0), Math.max(canonicalHeight - 1, 0));
  const width = Math.min(Math.max(Math.round(region.width * canonicalWidth), 1), canonicalWidth - left);
  const height = Math.min(Math.max(Math.round(region.height * canonicalHeight), 1), canonicalHeight - top);
  return { left, top, width, height };
};

/** Contain bounds per variant (api-routes-documents.md §2.7); `scale-down`
 * preserves aspect ratio and never upscales. */
const VARIANT_BOUNDS: Record<'workspace' | 'thumbnail' | 'transcription', number> = {
  workspace: 1600,
  thumbnail: 320,
  transcription: 2048,
};

export interface NormalizeAndStoreInput {
  bytes: ArrayBuffer;
  storageKey: string;
}

export interface RenderVariantInput {
  storageKey: string;
  variant: ImageVariant;
  rotation: Rotation;
  /** Required, already-validated, when variant === 'region'. */
  region: RegionCrop | null;
}

/** The exact stream type the Images binding expects — extracted from the
 * binding's own method signature rather than the bare global
 * `ReadableStream` name, which lib.dom.d.ts and @cloudflare/workers-types
 * both declare (incompatibly) under the same ambient identifier. */
export type ImageByteStream = Parameters<ImagesBinding['info']>[0];

export interface RenderedImage {
  body: ImageByteStream;
  contentType: string;
}

export interface PageImageRepository {
  /** Validates signature + decode, normalizes to canonical unrotated JPEG,
   * and writes it to R2 at `storageKey`. Throws UnsupportedImageError /
   * MalformedImageError; writes nothing on failure. */
  storeNormalizedImage(input: NormalizeAndStoreInput): Promise<void>;
  /** Best-effort compensating delete (e.g. DB write failed after R2 wrote). */
  deleteObject(storageKey: string): Promise<void>;
  /** Renders one authenticated variant; null when the object is missing. */
  renderVariant(input: RenderVariantInput): Promise<RenderedImage | null>;
}

const bufferToStream = (bytes: ArrayBuffer): ImageByteStream =>
  // Response(bytes).body gives a fresh, independently-consumable stream each
  // call so the same buffered bytes can feed info() and input() separately
  // (an R2 object body / Images input stream can only be read once). The
  // runtime value is a real Workers ReadableStream either way; only the two
  // ambient type declarations (dom lib vs workers-types) disagree.
  new Response(bytes).body as unknown as ImageByteStream;

export const createPageImageRepository = (
  bucket: R2Bucket,
  images: ImagesBinding,
): PageImageRepository => ({
  async storeNormalizedImage({ bytes, storageKey }) {
    const head = new Uint8Array(bytes.slice(0, 16));
    const signature = sniffImageSignature(head);
    if (!signature) {
      throw new UnsupportedImageError('File is not a JPEG, PNG, or HEIC image');
    }
    let info;
    try {
      info = await images.info(bufferToStream(bytes));
    } catch {
      throw new MalformedImageError('Image could not be decoded');
    }
    // `in`-based narrowing: ImageInfoResponse's non-svg branch has a wide
    // `format: string`, so a `format === 'image/svg+xml'` equality check
    // alone cannot eliminate it via control-flow narrowing.
    if (!('width' in info)) {
      throw new UnsupportedImageError('SVG images are not supported');
    }
    let result;
    try {
      result = await images.input(bufferToStream(bytes)).output({ format: 'image/jpeg' });
    } catch {
      throw new MalformedImageError('Image could not be normalized');
    }
    await bucket.put(storageKey, result.image(), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
  },

  async deleteObject(storageKey) {
    try {
      await bucket.delete(storageKey);
    } catch (error) {
      // Best-effort compensating delete; the object either never landed or
      // will be swept by the deletion pipeline if this also fails.
      console.error('page-image compensating delete failed', { storageKey, error });
    }
  },

  async renderVariant({ storageKey, variant, rotation, region }) {
    const object = await bucket.get(storageKey);
    if (!object) return null;

    // Fast path: unrotated original streams directly from R2 (REQ-012 — never
    // route bytes through a transform that isn't needed).
    if (variant === 'original' && rotation === 0) {
      return { body: object.body as unknown as ImageByteStream, contentType: 'image/jpeg' };
    }

    const bytes = await object.arrayBuffer();
    let transformer = images.input(bufferToStream(bytes));

    if (variant === 'region') {
      if (!region) {
        throw new Error('Region crop requires x/y/width/height');
      }
      const info = await images.info(bufferToStream(bytes));
      if (!('width' in info)) {
        throw new MalformedImageError('Cannot crop an SVG');
      }
      const box = regionToPixelBox(region, info.width, info.height);
      // Crop in canonical (unrotated) coordinates first (api-routes-documents
      // §2.7 transform order), before any rotation.
      transformer = transformer.transform({
        trim: { left: box.left, top: box.top, width: box.width, height: box.height },
      });
    }

    if (rotation !== 0) {
      transformer = transformer.transform({ rotate: rotation });
    }

    if (variant === 'workspace' || variant === 'thumbnail' || variant === 'transcription') {
      const bound = VARIANT_BOUNDS[variant];
      // 'scale-down' preserves aspect ratio and never upscales past the
      // canonical source (REQ-012).
      transformer = transformer.transform({ width: bound, height: bound, fit: 'scale-down' });
    }

    const result = await transformer.output({ format: 'image/jpeg' });
    return { body: result.image(), contentType: 'image/jpeg' };
  },
});
