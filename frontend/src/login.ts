type LoginResponse = {
  success: boolean;
  message?: string;
};

function setMessage(text: string): void {
  const msg = document.getElementById("msg");
  if (msg) {
    msg.innerText = text;
  }
}

async function submitLogin(form: HTMLFormElement): Promise<void> {
  const formData = new FormData(form);
  const res = await fetch("/login", { method: "POST", body: formData });
  const result = (await res.json()) as LoginResponse;

  if (res.ok && result.success) {
    window.location.href = "/admin";
    return;
  }

  setMessage(result.message || "로그인 실패");
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitLogin(form);
    } catch (error) {
      console.error(error);
      setMessage("서버 통신 오류가 발생했습니다.");
    }
  });
});
