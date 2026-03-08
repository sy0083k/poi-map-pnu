import { parseJpegExifGps } from "../photo/exif-gps";

import { getFileLabel, isJpeg } from "./photo-mode-helpers";

import type { PhotoImportSummary, PhotoMarkerItem } from "./photo-mode-types";

type ImportDeps = {
  setMapStatus: (message: string, color?: string) => void;
};

export function createPhotoModeImport(deps: ImportDeps) {
  const buildMarkerItems = async (files: FileList): Promise<{ items: PhotoMarkerItem[]; summary: PhotoImportSummary }> => {
    const allFiles = Array.from(files);
    const jpegFiles = allFiles.filter((file) => isJpeg(file));
    const summary: PhotoImportSummary = {
      totalFiles: allFiles.length,
      jpegCandidates: jpegFiles.length,
      gpsFound: 0,
      skippedNoGps: 0,
      skippedUnsupported: allFiles.length - jpegFiles.length,
      parseErrors: 0
    };

    const nextMarkerItems: PhotoMarkerItem[] = [];
    deps.setMapStatus(`사진 EXIF를 분석 중입니다... (0/${jpegFiles.length})`, "#1d4ed8");

    for (let index = 0; index < jpegFiles.length; index += 1) {
      const file = jpegFiles[index];
      try {
        const buffer = await file.arrayBuffer();
        const gps = parseJpegExifGps(buffer);
        if (!gps) {
          summary.skippedNoGps += 1;
        } else {
          const labels = getFileLabel(file);
          nextMarkerItems.push({
            id: summary.gpsFound + 1,
            file,
            fileName: labels.fileName,
            relativePath: labels.relativePath,
            lat: gps.lat,
            lon: gps.lon
          });
          summary.gpsFound += 1;
        }
      } catch {
        summary.parseErrors += 1;
      }

      if ((index + 1) % 20 === 0 || index + 1 === jpegFiles.length) {
        deps.setMapStatus(`사진 EXIF를 분석 중입니다... (${index + 1}/${jpegFiles.length})`, "#1d4ed8");
      }
    }

    return {
      items: nextMarkerItems,
      summary
    };
  };

  return {
    buildMarkerItems
  };
}
