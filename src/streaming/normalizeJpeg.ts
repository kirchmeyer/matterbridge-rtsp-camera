/** Standard JFIF APP0 marker (baseline JPEG) after SOI. */
const JFIF_APP0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]);

/**
 * Some clients (e.g. SmartThings) reject ffmpeg snapshots that start with COM (FF FE Lavc…).
 * Strip leading comment segments and ensure a JFIF APP0 header is present.
 */
export function normalizeJpeg(jpeg: Uint8Array): Uint8Array {
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
        return jpeg;
    }

    let offset = 2;
    let hasJfif = false;

    while (offset + 4 <= jpeg.length) {
        if (jpeg[offset] !== 0xff) break;

        const marker = jpeg[offset + 1];
        if (marker === 0xfe) {
            const segmentLen = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
            offset += 2 + segmentLen;
            continue;
        }
        if (marker === 0xe0) {
            hasJfif = true;
        }
        break;
    }

    if (hasJfif && offset === 2) {
        return jpeg;
    }

    const body = jpeg.slice(offset);
    const out = new Uint8Array(2 + JFIF_APP0.length + body.length);
    out[0] = 0xff;
    out[1] = 0xd8;
    out.set(JFIF_APP0, 2);
    out.set(body, 2 + JFIF_APP0.length);
    return out;
}

/** Read encoded dimensions from the first SOF marker in a baseline JPEG. */
export function readJpegDimensions(jpeg: Uint8Array): { width: number; height: number } | undefined {
    if (jpeg.length < 10 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
        return undefined;
    }

    let offset = 2;
    while (offset + 9 < jpeg.length) {
        if (jpeg[offset] !== 0xff) {
            return undefined;
        }

        const marker = jpeg[offset + 1];
        if (marker === 0xd9) {
            break;
        }

        const segmentLen = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
        if (segmentLen < 2 || offset + 2 + segmentLen > jpeg.length) {
            return undefined;
        }

        const isSof = marker >= 0xc0 && marker <= 0xcf
            && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) {
            const height = (jpeg[offset + 5] << 8) | jpeg[offset + 6];
            const width = (jpeg[offset + 7] << 8) | jpeg[offset + 8];
            if (width > 0 && height > 0) {
                return { width, height };
            }
            return undefined;
        }

        offset += 2 + segmentLen;
    }

    return undefined;
}
