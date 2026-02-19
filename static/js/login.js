function setMessage(text) {
  const msg = document.getElementById("msg");
  if (msg) {
    msg.innerText = text;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      const res = await fetch("/login", { method: "POST", body: formData });
      const result = await res.json();

      if (res.ok && result.success) {
        window.location.href = "/admin";
      } else {
        setMessage(result.message || "로그인 실패");
      }
    } catch (error) {
      console.error(error);
      setMessage("서버 통신 오류가 발생했습니다.");
    }
  });
});
