import { fetchJson } from "../http";

import type { LandListItem } from "./types";

export type File2MapUploadParseResponse = {
  success: boolean;
  items: LandListItem[];
  summary: {
    fileName: string;
    rowCount: number;
    uniquePnuCount: number;
  };
};

export async function parseFile2MapUploadOnServer(file: File): Promise<File2MapUploadParseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return fetchJson<File2MapUploadParseResponse>("/api/file2map/upload/parse", {
    method: "POST",
    body: formData,
    timeoutMs: 30000,
  });
}
