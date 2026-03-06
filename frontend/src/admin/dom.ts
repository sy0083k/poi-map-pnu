export function requireElement<T extends Element>(id: string, type: { new (): T }): T | null {
  const el = document.getElementById(id);
  return el instanceof type ? el : null;
}

export function initTabs(onStatsSelected: () => void): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".nav button");
  const panels: Record<string, HTMLElement | null> = {
    upload: document.getElementById("panel-upload"),
    settings: document.getElementById("panel-settings"),
    password: document.getElementById("panel-password"),
    stats: document.getElementById("panel-stats")
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");

      const name = tab.dataset.tab || "upload";
      Object.values(panels).forEach((panel) => panel?.classList.remove("active"));
      panels[name]?.classList.add("active");

      if (name === "stats") {
        onStatsSelected();
      }
    });
  });
}

export function validateSettingsForm(): boolean {
  const input = document.querySelector<HTMLInputElement>('input[name="settings_password"]');
  if (!input || !input.value.trim()) {
    alert("환경 변수 저장을 위해 관리자 비밀번호를 입력해주세요.");
    return false;
  }
  return true;
}
