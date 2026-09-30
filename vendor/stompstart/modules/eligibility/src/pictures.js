// Pictures as the eligibility rules see them: decoded RGBA, then greyscale on white at a small
// size, and the judgments on them: whether a logo is the site's own original or one of its smaller
// icons enlarged, and whether a gallery picture shows the product. The resampling is plain
// arithmetic; decoding is the ports' (public-ports.ts decodes with WebAssembly codecs).
/** Decoding stops above this many pixels (4K). */
export const MAX_PIXELS = 3_840 * 2_160;
/** One pixel's grey value, flattened on white. */
function greyAt(rgba, index) {
    const alpha = (rgba[index * 4 + 3] ?? 255) / 255;
    const channel = (offset) => (rgba[index * 4 + offset] ?? 0) * alpha + 255 * (1 - alpha);
    return 0.299 * channel(0) + 0.587 * channel(1) + 0.114 * channel(2);
}
/**
 * The picture in greyscale at this size, flattened on white: each pixel is the mean of the area
 * it covers when shrinking, and interpolated between its neighbours when enlarging.
 */
export function greyscale(picture, width, height) {
    const { rgba, width: sourceWidth, height: sourceHeight } = picture;
    const out = new Uint8Array(width * height);
    if (sourceWidth >= width && sourceHeight >= height) {
        const scaleX = sourceWidth / width;
        const scaleY = sourceHeight / height;
        for (let y = 0; y < height; y += 1) {
            const top = y * scaleY;
            const bottom = top + scaleY;
            for (let x = 0; x < width; x += 1) {
                const left = x * scaleX;
                const right = left + scaleX;
                let sum = 0;
                let weight = 0;
                for (let row = Math.floor(top); row < Math.min(Math.ceil(bottom), sourceHeight); row += 1) {
                    const rowWeight = Math.min(row + 1, bottom) - Math.max(row, top);
                    for (let column = Math.floor(left); column < Math.min(Math.ceil(right), sourceWidth); column += 1) {
                        const cell = rowWeight * (Math.min(column + 1, right) - Math.max(column, left));
                        sum += greyAt(rgba, row * sourceWidth + column) * cell;
                        weight += cell;
                    }
                }
                out[y * width + x] = Math.round(sum / weight);
            }
        }
        return out;
    }
    const along = (target, size, count) => {
        const at = Math.min(Math.max(((target + 0.5) * size) / count - 0.5, 0), size - 1);
        const low = Math.floor(at);
        return { low, high: Math.min(low + 1, size - 1), part: at - low };
    };
    for (let y = 0; y < height; y += 1) {
        const row = along(y, sourceHeight, height);
        for (let x = 0; x < width; x += 1) {
            const column = along(x, sourceWidth, width);
            const at = (r, c) => greyAt(rgba, r * sourceWidth + c);
            const upper = at(row.low, column.low) * (1 - column.part) + at(row.low, column.high) * column.part;
            const lower = at(row.high, column.low) * (1 - column.part) + at(row.high, column.high) * column.part;
            out[y * width + x] = Math.round(upper * (1 - row.part) + lower * row.part);
        }
    }
    return out;
}
/** A 64-bit difference hash: each of 9 by 8 grey pixels against its right neighbour. */
export function differenceHash(picture) {
    const pixels = greyscale(picture, 9, 8);
    let hash = 0n;
    for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
            hash = (hash << 1n) | ((pixels[y * 9 + x] ?? 0) > (pixels[y * 9 + x + 1] ?? 0) ? 1n : 0n);
        }
    }
    return hash;
}
/** The bits two difference hashes differ by. */
export function hashDistance(left, right) {
    let value = left ^ right;
    let count = 0;
    while (value > 0n) {
        count += Number(value & 1n);
        value >>= 1n;
    }
    return count;
}
/** How far two same-size grey pictures differ: the mean and 95th percentile per pixel. */
export function pixelDifference(left, right) {
    const counts = new Uint32Array(256);
    let sum = 0;
    for (let index = 0; index < left.length; index += 1) {
        const difference = Math.abs((left[index] ?? 0) - (right[index] ?? 0));
        counts[difference] = (counts[difference] ?? 0) + 1;
        sum += difference;
    }
    const rank = Math.floor(left.length * 0.95);
    let seen = 0;
    let p95 = 0;
    for (let value = 0; value < 256; value += 1) {
        seen += counts[value] ?? 0;
        if (seen > rank) {
            p95 = value;
            break;
        }
    }
    return { mean: sum / Math.max(left.length, 1), p95 };
}
/**
 * How sharp a square grey picture is: the mean squared difference between neighbouring pixels.
 * An enlargement is no sharper than the picture it was made from; an original drawn at a larger
 * size is.
 */
export function sharpness(pixels, edge) {
    let sum = 0;
    for (let y = 0; y < edge; y += 1) {
        for (let x = 0; x < edge; x += 1) {
            const value = pixels[y * edge + x] ?? 0;
            if (x + 1 < edge)
                sum += (value - (pixels[y * edge + x + 1] ?? 0)) ** 2;
            if (y + 1 < edge)
                sum += (value - (pixels[(y + 1) * edge + x] ?? 0)) ** 2;
        }
    }
    return sum / Math.max(2 * edge * edge, 1);
}
/** The share of the picture that is near white or near black, at 64 by 36. */
export function blankShare(picture) {
    const pixels = greyscale(picture, 64, 36);
    let blank = 0;
    for (const value of pixels)
        if (value >= 240 || value <= 15)
            blank += 1;
    return blank / pixels.length;
}
/** Pictures compare at this size, or the logo's own when smaller. */
export const COMPARE_EDGE = 256;
/** Bits two difference hashes may differ by and still be the same picture. */
export const SAME_PICTURE_BITS = 10;
/**
 * A logo is a smaller icon enlarged when, at the comparison size, the two agree to this mean
 * difference and the logo is no sharper than this many times the icon. Measured on logos and
 * their own icons: enlargements differ by 0.1 to 0.45 and are 0.87 to 1.28 times as sharp;
 * originals differ by 0.82 or more and are 1.8 times as sharp or more. Both must hold, so a
 * plain original with little edge (one flat shape) is never taken for an enlargement.
 */
const ENLARGED_MEAN = 0.5;
const ENLARGED_SHARPNESS = 1.5;
/** A picture this much near white or near black is an empty or error page. */
export const BLANK_SHARE = 0.97;
/** Where a logo comes from, judged against the site's own icons. Enlarged outranks any match. */
export function logoOrigin(logo, icons) {
    const edge = Math.min(logo.width, logo.height);
    const compare = Math.min(COMPARE_EDGE, edge);
    const hash = differenceHash(logo);
    let large = null;
    let original = null;
    let redrawn = null;
    for (const icon of icons) {
        if (hashDistance(hash, differenceHash(icon.picture)) > SAME_PICTURE_BITS)
            continue;
        const size = Math.min(icon.picture.width, icon.picture.height);
        if (icon.picture.vector || size >= edge * 0.9) {
            original ??= icon.url;
            continue;
        }
        large ??= greyscale(logo, compare, compare);
        const theirs = greyscale(icon.picture, compare, compare);
        const iconSharpness = sharpness(theirs, compare);
        const sharper = iconSharpness > 0 ? sharpness(large, compare) / iconSharpness : 1;
        if (pixelDifference(large, theirs).mean <= ENLARGED_MEAN && sharper <= ENLARGED_SHARPNESS) {
            return { kind: "enlarged", url: icon.url, size };
        }
        redrawn ??= icon.url;
    }
    if (original)
        return { kind: "original", url: original };
    if (redrawn)
        return { kind: "redrawn", url: redrawn };
    return { kind: "unmatched", compared: icons.length };
}
/**
 * What a gallery picture is: `blank` (an empty or error page), `share` (the site's own share
 * image, by its hash among `share`), `narrow` (under `minWidth`), or `product`.
 */
export function galleryImage(picture, share, minWidth) {
    if (blankShare(picture) >= BLANK_SHARE)
        return "blank";
    const hash = differenceHash(picture);
    if (share.some((other) => hashDistance(hash, other) <= SAME_PICTURE_BITS))
        return "share";
    return picture.width < minWidth ? "narrow" : "product";
}
//# sourceMappingURL=pictures.js.map