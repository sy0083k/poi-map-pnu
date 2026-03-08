export type PhotoMarkerItem = {
  id: number;
  file: File;
  fileName: string;
  relativePath: string;
  lat: number;
  lon: number;
};

export type PhotoImportSummary = {
  totalFiles: number;
  jpegCandidates: number;
  gpsFound: number;
  skippedNoGps: number;
  skippedUnsupported: number;
  parseErrors: number;
};
