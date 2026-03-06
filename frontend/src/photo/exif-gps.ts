export type PhotoGpsLocation = {
  lat: number;
  lon: number;
};

const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

function readAscii(view: DataView, offset: number, length: number): string {
  const chars: string[] = [];
  const limit = Math.min(view.byteLength, offset + length);
  for (let i = offset; i < limit; i += 1) {
    const code = view.getUint8(i);
    if (code === 0) {
      break;
    }
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

function readUint16(view: DataView, offset: number, littleEndian: boolean): number {
  if (offset + 2 > view.byteLength) {
    throw new Error("EXIF uint16 offset out of range");
  }
  return view.getUint16(offset, littleEndian);
}

function readUint32(view: DataView, offset: number, littleEndian: boolean): number {
  if (offset + 4 > view.byteLength) {
    throw new Error("EXIF uint32 offset out of range");
  }
  return view.getUint32(offset, littleEndian);
}

function readRational(
  view: DataView,
  tiffStart: number,
  valueOffset: number,
  index: number,
  littleEndian: boolean
): number {
  const absolute = tiffStart + valueOffset + index * 8;
  if (absolute + 8 > view.byteLength) {
    throw new Error("EXIF rational offset out of range");
  }
  const numerator = view.getUint32(absolute, littleEndian);
  const denominator = view.getUint32(absolute + 4, littleEndian);
  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function asDecimalDegree(ref: string, values: [number, number, number]): number {
  const [deg, min, sec] = values;
  const absolute = deg + min / 60 + sec / 3600;
  const upperRef = ref.toUpperCase();
  if (upperRef === "S" || upperRef === "W") {
    return -absolute;
  }
  return absolute;
}

function readIfdEntries(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean
): Array<{ tag: number; type: number; count: number; valueOffset: number; entryOffset: number }> {
  const absolute = tiffStart + ifdOffset;
  const count = readUint16(view, absolute, littleEndian);
  const entries: Array<{ tag: number; type: number; count: number; valueOffset: number; entryOffset: number }> = [];

  for (let i = 0; i < count; i += 1) {
    const entryOffset = absolute + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) {
      break;
    }
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

function readAsciiFromEntry(
  view: DataView,
  tiffStart: number,
  entry: { type: number; count: number; valueOffset: number; entryOffset: number },
  littleEndian: boolean
): string {
  if (entry.type !== TYPE_ASCII || entry.count === 0) {
    return "";
  }

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
      if (bytes[i] === 0) {
        break;
      }
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }

  return readAscii(view, tiffStart + entry.valueOffset, entry.count);
}

function readRationalTripletFromEntry(
  view: DataView,
  tiffStart: number,
  entry: { type: number; count: number; valueOffset: number },
  littleEndian: boolean
): [number, number, number] | null {
  if (entry.type !== TYPE_RATIONAL || entry.count < 3) {
    return null;
  }
  return [
    readRational(view, tiffStart, entry.valueOffset, 0, littleEndian),
    readRational(view, tiffStart, entry.valueOffset, 1, littleEndian),
    readRational(view, tiffStart, entry.valueOffset, 2, littleEndian)
  ];
}

export function parseJpegExifGps(buffer: ArrayBuffer): PhotoGpsLocation | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4) {
    return null;
  }

  if (view.getUint16(0, false) !== 0xffd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }

    const marker = view.getUint8(offset + 1);
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = readUint16(view, offset, false);
    if (segmentLength < 2) {
      break;
    }
    const segmentDataStart = offset + 2;
    const segmentEnd = offset + segmentLength;

    if (segmentEnd > view.byteLength) {
      break;
    }

    if (marker === 0xe1 && segmentLength >= 8) {
      const exifHeader = readAscii(view, segmentDataStart, 6);
      if (exifHeader.startsWith("Exif")) {
        const tiffStart = segmentDataStart + 6;
        if (tiffStart + 8 > view.byteLength) {
          return null;
        }

        const byteOrder = readAscii(view, tiffStart, 2);
        const littleEndian = byteOrder === "II";
        if (!littleEndian && byteOrder !== "MM") {
          return null;
        }

        const magic = readUint16(view, tiffStart + 2, littleEndian);
        if (magic !== 42) {
          return null;
        }

        const ifd0Offset = readUint32(view, tiffStart + 4, littleEndian);
        const ifd0Entries = readIfdEntries(view, tiffStart, ifd0Offset, littleEndian);
        const gpsPointer = ifd0Entries.find((entry) => entry.tag === TAG_GPS_IFD_POINTER);
        if (!gpsPointer) {
          return null;
        }

        const gpsIfdOffset = gpsPointer.valueOffset;
        const gpsEntries = readIfdEntries(view, tiffStart, gpsIfdOffset, littleEndian);
        const latRefEntry = gpsEntries.find((entry) => entry.tag === TAG_GPS_LAT_REF);
        const latEntry = gpsEntries.find((entry) => entry.tag === TAG_GPS_LAT);
        const lonRefEntry = gpsEntries.find((entry) => entry.tag === TAG_GPS_LON_REF);
        const lonEntry = gpsEntries.find((entry) => entry.tag === TAG_GPS_LON);

        if (!latRefEntry || !latEntry || !lonRefEntry || !lonEntry) {
          return null;
        }

        const latRef = readAsciiFromEntry(view, tiffStart, latRefEntry, littleEndian);
        const lonRef = readAsciiFromEntry(view, tiffStart, lonRefEntry, littleEndian);
        const latTriplet = readRationalTripletFromEntry(view, tiffStart, latEntry, littleEndian);
        const lonTriplet = readRationalTripletFromEntry(view, tiffStart, lonEntry, littleEndian);

        if (!latRef || !lonRef || !latTriplet || !lonTriplet) {
          return null;
        }

        return {
          lat: asDecimalDegree(latRef, latTriplet),
          lon: asDecimalDegree(lonRef, lonTriplet)
        };
      }
    }

    offset = segmentEnd;
  }

  return null;
}
