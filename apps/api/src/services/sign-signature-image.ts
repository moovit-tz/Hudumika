import sharp from 'sharp';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/** Decode before recording consent: a MIME prefix or PNG header is not an image. */
export async function normalizeSignatureImage(value: unknown): Promise<string> {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_SIZE) {
    throw new Error('A signature image of at most 2 MB is required');
  }
  const match = /^data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('Signature must be a PNG or JPEG image data URI');
  try {
    const source = Buffer.from(match[1], 'base64');
    if (source.toString('base64') !== match[1]) throw new Error('Invalid base64');
    const image = await sharp(source, { limitInputPixels: 4_000_000, failOn: 'warning' })
      .rotate().png().toBuffer();
    const normalized = `data:image/png;base64,${image.toString('base64')}`;
    if (normalized.length > MAX_IMAGE_SIZE) throw new Error('Decoded image is too large');
    return normalized;
  } catch {
    throw new Error('Signature image contains invalid or oversized image data');
  }
}
