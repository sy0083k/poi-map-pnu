import type { CadastralCrs, LandFeature } from "./types";

export type WorkerChunkPayload = {
  features: LandFeature[];
  scanned: number;
  matched: number;
  total: number;
};

export type WorkerProgressPayload = {
  scanned: number;
  matched: number;
  total: number;
};

export type WorkerDonePayload = {
  scanned: number;
  matched: number;
  total: number;
};

export type WorkerErrorPayload = {
  message: string;
};

export type WorkerResponse =
  | {
      type: "chunk";
      payload: WorkerChunkPayload;
    }
  | {
      type: "progress";
      payload: WorkerProgressPayload;
    }
  | {
      type: "done";
      payload: WorkerDonePayload;
    }
  | {
      type: "error";
      payload: WorkerErrorPayload;
    };

export type WorkerStartMessage = {
  type: "start";
  payload: {
    fgbUrl: string;
    pnuField: string;
    cadastralCrs: CadastralCrs;
    uploadedPnus: string[];
  };
};
