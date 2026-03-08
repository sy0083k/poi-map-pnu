export const TYPE_ASCII = 2;
export const TYPE_RATIONAL = 5;

export function readAscii(view: DataView, offset: number, length: number): string {
  const chars: string[] = [];
  const limit = Math.min(view.byteLength, offset + length);
  for (let i = offset; i < limit; i += 1) {
    const code = view.getUint8(i);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

export function readUint16(view: DataView, offset: number, littleEndian: boolean): number {
  if (offset + 2 > view.byteLength) throw new Error("EXIF uint16 offset out of range");
  return view.getUint16(offset, littleEndian);
}

export function readUint32(view: DataView, offset: number, littleEndian: boolean): number {
  if (offset + 4 > view.byteLength) throw new Error("EXIF uint32 offset out of range");
  return view.getUint32(offset, littleEndian);
}

export function readRational(
  view: DataView,
  tiffStart: number,
  valueOffset: number,
  index: number,
  littleEndian: boolean
): number {
  const absolute = tiffStart + valueOffset + index * 8;
  if (absolute + 8 > view.byteLength) throw new Error("EXIF rational offset out of range");
  const numerator = view.getUint32(absolute, littleEndian);
  const denominator = view.getUint32(absolute + 4, littleEndian);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function asDecimalDegree(ref: string, values: [number, number, number]): number {
  const [deg, min, sec] = values;
  const absolute = deg + min / 60 + sec / 3600;
  const upperRef = ref.toUpperCase();
  return upperRef === "S" || upperRef === "W" ? -absolute : absolute;
}

type IfdEntry = { tag: number; type: number; count: number; valueOffset: number; entryOffset: number };

export function readIfdEntries(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean
): IfdEntry[] {
  const absolute = tiffStart + ifdOffset;
  const count = readUint16(view, absolute, littleEndian);
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const entryOffset = absolute + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    entries.push({
      tag: readUint16(view, entryOffset, littleEndian),
      type: readUint16(view, entryOffset + 2, littleEndian),
      count: readUint32(view, entryOffset + 4, littleEndian),
      valueOffset: readUint32(view, entryOffset + 8, littleEndian),
      entryOffset
    });
  }
  return entries;
}

export function readAsciiFromEntry(view: DataView, tiffStart: number, entry: IfdEntry, littleEndian: boolean): string {
  if (entry.type !== TYPE_ASCII || entry.count === 0) return "";
  if (entry.count <= 4) {
    const bytes = new Uint8Array(4);
    const inlineValue = readUint32(view, entry.entryOffset + 8, littleEndian);
    if (littleEndian) {
      bytes[0] = inlineValue & 0xff;
      bytes[1] = (inlineValue >> 8) & 0xff;
      bytes[2] = (inlineValue >> 16) & 0xff;
      bytes[3] = (inlineValue >> 24) & 0xff;
    } else {
      bytes[0] = (inlineValue >> 24) & 0xff;
      bytes[1] = (inlineValue >> 16) & 0xff;
      bytes[2] = (inlineValue >> 8) & 0xff;
      bytes[3] = inlineValue & 0xff;
    }
    let result = "";
    for (let i = 0; i < entry.count; i += 1) {
      if (bytes[i] === 0) break;
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
  return readAscii(view, tiffStart + entry.valueOffset, entry.count);
}

export function readRationalTripletFromEntry(
  view: DataView,
  tiffStart: number,
  entry: { type: number; count: number; valueOffset: number },
  littleEndian: boolean
): [number, number, number] | null {
  if (entry.type !== TYPE_RATIONAL || entry.count < 3) return null;
  return [
    readRational(view, tiffStart, entry.valueOffset, 0, littleEndian),
    readRational(view, tiffStart, entry.valueOffset, 1, littleEndian),
    readRational(view, tiffStart, entry.valueOffset, 2, littleEndian)
  ];
}
