function initTabs() {
  const tabs = document.querySelectorAll(".nav button");
  const panels = {
    upload: document.getElementById("panel-upload"),
    settings: document.getElementById("panel-settings"),
    password: document.getElementById("panel-password")
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");

      const name = tab.dataset.tab || "upload";
      Object.values(panels).forEach((panel) => panel && panel.classList.remove("active"));
      if (panels[name]) {
        panels[name].classList.add("active");
      }
    });
  });
}

function validateSettingsForm() {
  const input = document.querySelector('input[name="settings_password"]');
  if (!input || !input.value.trim()) {
    alert("환경 변수 저장을 위해 관리자 비밀번호를 입력해주세요.");
    return false;
  }
  return true;
}

async function handleUpload(csrfToken) {
  const fileInput = document.getElementById("excelFile");
  const status = document.getElementById("status");

  if (!fileInput || !status) return;

  if (!fileInput.files || !fileInput.files[0]) {
    alert("파일을 선택해주세요.");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  formData.append("csrf_token", csrfToken);

  status.style.color = "black";

  try {
    status.innerText = "1단계: 엑셀 파일 입력 중...";
    const res = await fetch("/admin/upload", { method: "POST", body: formData });
    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || "업로드 실패");
    }

    status.style.color = "green";
    status.innerText = "✅ " + result.message;
    alert("서버에서 데이터 처리를 시작했습니다.\n이제 이 창을 닫으셔도 작업은 중단되지 않습니다.");
  } catch (error) {
    status.style.color = "red";
    status.innerText = "오류 발생: " + String(error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();

  const csrfInput = document.getElementById("csrfToken");
  const uploadButton = document.getElementById("uploadBtn");
  const settingsForm = document.getElementById("settingsForm");

  if (uploadButton && csrfInput) {
    uploadButton.addEventListener("click", () => {
      handleUpload(csrfInput.value);
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", (event) => {
      if (!validateSettingsForm()) {
        event.preventDefault();
      }
    });
  }
});
