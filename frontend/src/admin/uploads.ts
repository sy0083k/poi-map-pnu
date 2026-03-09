import { HttpError, fetchJson } from "../http";
import { requireElement } from "./dom";

type UploadResponse = {
  success: boolean;
  total?: number;
  message: string;
  pnuSummary?: {
    totalRows: number;
    uniquePnu: number;
  };
  appliedPath?: string;
  fileSizeBytes?: number;
};

type ThemeUploadOptions = {
  fileInputId: string;
  statusId: string;
  endpoint: string;
  emptyFileMessage: string;
  loadingMessage: string;
};

export async function handleThemeUpload(csrfToken: string, options: ThemeUploadOptions): Promise<void> {
  const fileInput = requireElement(options.fileInputId, HTMLInputElement);
  const status = requireElement(options.statusId, HTMLDivElement);

  if (!fileInput || !status) {
    return;
  }

  const file = fileInput.files?.[0];
  if (!file) {
    alert(options.emptyFileMessage);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("csrf_token", csrfToken);

  status.style.color = "black";

  try {
    status.innerText = options.loadingMessage;
    const result = await fetchJson<UploadResponse>(options.endpoint, {
      method: "POST",
      body: formData,
      timeoutMs: 45000
    });

    status.style.color = "green";
    if (result.pnuSummary) {
      status.innerText =
        `업로드 완료: ${result.message}\n` +
        `업로드 결과: ${result.pnuSummary.totalRows}건 / 고유 PNU ${result.pnuSummary.uniquePnu}건`;
    } else if (result.appliedPath && typeof result.fileSizeBytes === "number") {
      status.innerText =
        `업로드 완료: ${result.message}\n` +
        `적용 경로: ${result.appliedPath}\n` +
        `파일 크기: ${result.fileSizeBytes.toLocaleString()} bytes`;
    } else {
      status.innerText = `업로드 완료: ${result.message}`;
    }
  } catch (error) {
    status.style.color = "red";
    const message = error instanceof HttpError ? error.message : String(error);
    status.innerText = `오류 발생: ${message}`;
  }
}
