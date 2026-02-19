import { HttpError, fetchJson } from "./http";

type UploadResponse = {
  success: boolean;
  total?: number;
  message: string;
  geomJobId?: number;
};

function requireElement<T extends Element>(id: string, type: { new (): T }): T | null {
  const el = document.getElementById(id);
  return el instanceof type ? el : null;
}

function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".nav button");
  const panels: Record<string, HTMLElement | null> = {
    upload: document.getElementById("panel-upload"),
    settings: document.getElementById("panel-settings"),
    password: document.getElementById("panel-password")
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");

      const name = tab.dataset.tab || "upload";
      Object.values(panels).forEach((panel) => panel?.classList.remove("active"));
      panels[name]?.classList.add("active");
    });
  });
}

async function handleUpload(csrfToken: string): Promise<void> {
  const fileInput = requireElement("excelFile", HTMLInputElement);
  const status = requireElement("status", HTMLDivElement);

  if (!fileInput || !status) {
    return;
  }

  const file = fileInput.files?.[0];
  if (!file) {
    alert("파일을 선택해주세요.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("csrf_token", csrfToken);

  status.style.color = "black";

  try {
    status.innerText = "1단계: 엑셀 파일 입력 중...";
    const result = await fetchJson<UploadResponse>("/admin/upload", {
      method: "POST",
      body: formData,
      timeoutMs: 45000
    });

    status.style.color = "green";
    status.innerText = result.geomJobId
      ? `업로드 완료 (작업 ID: ${result.geomJobId}). 경계선 보강이 백그라운드에서 진행됩니다.`
      : `업로드 완료: ${result.message}`;
    alert("서버에서 데이터 처리를 시작했습니다. 창을 닫아도 작업은 계속됩니다.");
  } catch (error) {
    status.style.color = "red";
    const message = error instanceof HttpError ? error.message : String(error);
    status.innerText = `오류 발생: ${message}`;
  }
}

function validateSettingsForm(): boolean {
  const input = document.querySelector<HTMLInputElement>('input[name="settings_password"]');
  if (!input || !input.value.trim()) {
    alert("환경 변수 저장을 위해 관리자 비밀번호를 입력해주세요.");
    return false;
  }
  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();

  const csrfInput = requireElement("csrfToken", HTMLInputElement);
  const uploadButton = document.getElementById("uploadBtn");
  const settingsForm = document.getElementById("settingsForm");

  if (uploadButton && csrfInput) {
    uploadButton.addEventListener("click", () => {
      void handleUpload(csrfInput.value);
    });
  }

  if (settingsForm instanceof HTMLFormElement) {
    settingsForm.addEventListener("submit", (event) => {
      if (!validateSettingsForm()) {
        event.preventDefault();
      }
    });
  }
});
