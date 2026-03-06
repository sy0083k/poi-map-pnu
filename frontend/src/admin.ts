import { initTabs, requireElement, validateSettingsForm } from "./admin/dom";
import { loadStats } from "./admin/stats";
import { handleThemeUpload } from "./admin/uploads";

document.addEventListener("DOMContentLoaded", () => {
  initTabs(() => {
    void loadStats(false);
  });

  const csrfInput = requireElement("csrfToken", HTMLInputElement);
  const uploadCityButton = document.getElementById("uploadBtnCity");
  const settingsForm = document.getElementById("settingsForm");
  const refreshStatsButton = document.getElementById("refreshStatsBtn");

  if (uploadCityButton && csrfInput) {
    uploadCityButton.addEventListener("click", () => {
      void handleThemeUpload(csrfInput.value, {
        fileInputId: "excelFileCity",
        statusId: "statusCity",
        endpoint: "/admin/upload/city",
        emptyFileMessage: "시유지 파일을 선택해주세요.",
        loadingMessage: "시유지 파일 업로드 중..."
      });
    });
  }

  if (settingsForm instanceof HTMLFormElement) {
    settingsForm.addEventListener("submit", (event) => {
      if (!validateSettingsForm()) {
        event.preventDefault();
      }
    });
  }

  if (refreshStatsButton instanceof HTMLButtonElement) {
    refreshStatsButton.addEventListener("click", () => {
      void loadStats(true);
    });
  }
});
