import {
  asDecimalDegree,
  readAscii,
  readAsciiFromEntry,
  readIfdEntries,
  readRationalTripletFromEntry,
  readUint16,
  readUint32
} from "./exif-gps-reader";

export type PhotoGpsLocation = {
  lat: number;
  lon: number;
};

const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

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
