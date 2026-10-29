// Camera frames are decoded locally. No frame or video is uploaded.
export async function scanConnectionQR({ open, close, onScan }) {
  open(
    '<h2>Quét QR của Em</h2><p>Đưa mã QR kết nối vào khung hình.</p><video id="connection-camera" autoplay muted playsinline aria-label="Camera quét mã QR"></video><p id="camera-status" role="status">Đang mở camera…</p><button class="small-button" id="stop-camera">Dừng quét</button>',
  );
  const video = document.querySelector("#connection-camera");
  const status = document.querySelector("#camera-status");
  const dialog = video.closest("dialog");
  const controller = new AbortController();
  let stream,
    timer,
    timeout,
    stopped = false;
  const observer = new MutationObserver(() => {
    if (!video.isConnected || !dialog.open) stop();
  });
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(timeout);
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    observer.disconnect();
    controller.abort();
  };
  const fail = (message) => {
    stop();
    if (status.isConnected) status.textContent = message;
  };
  observer.observe(dialog, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  dialog.addEventListener("close", stop, { signal: controller.signal });
  dialog.addEventListener("cancel", stop, { signal: controller.signal });
  window.addEventListener("pagehide", stop, { signal: controller.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden)
        fail("Đã dừng camera khi rời ứng dụng. Đóng và mở lại để quét tiếp.");
    },
    { signal: controller.signal },
  );
  document.querySelector("#stop-camera").onclick = () => {
    stop();
    close();
  };
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      return fail(
        "Camera cần HTTPS hoặc localhost. Anh có thể nhập mã thủ công hoặc dùng camera điện thoại mở liên kết QR.",
      );
    await import("../vendor/jsqr.js");
    if (stopped) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (stopped || !video.isConnected || !dialog.open) {
      stop();
      return;
    }
    video.srcObject = stream;
    await video.play();
    if (stopped) return;
    status.textContent = "Đang tìm mã QR…";
    timeout = setTimeout(
      () =>
        fail(
          "Chưa tìm thấy mã QR. Đóng và mở lại camera hoặc nhập mã thủ công.",
        ),
      90000,
    );
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      return fail("Không đọc được hình ảnh camera. Hãy nhập mã thủ công.");
    const scan = () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          canvas.width = Math.min(video.videoWidth, 800);
          canvas.height = Math.round(
            (video.videoHeight * canvas.width) / video.videoWidth,
          );
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = globalThis.jsQR(
            frame.data,
            frame.width,
            frame.height,
            { inversionAttempts: "dontInvert" },
          );
          if (result) {
            stop();
            close();
            onScan(result.data);
            return;
          }
        }
        timer = setTimeout(scan, 180);
      } catch {
        fail("Không đọc được mã QR. Hãy thử lại hoặc nhập mã thủ công.");
      }
    };
    scan();
  } catch (error) {
    if (stopped) return;
    fail(
      error.name === "NotAllowedError"
        ? "Chưa được cấp quyền camera. Hãy cho phép camera hoặc nhập mã thủ công."
        : "Không mở được camera. Hãy kiểm tra thiết bị hoặc nhập mã thủ công.",
    );
  }
}
