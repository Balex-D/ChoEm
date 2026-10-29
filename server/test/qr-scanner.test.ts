import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
// @ts-ignore Existing qrcode PNG dependency.
import { PNG } from "pngjs";
// @ts-ignore Browser scanner with controlled camera/DOM test fixtures.
import { scanConnectionQR } from "../../dist/js/qr-scanner.js";

function setup(getUserMedia: () => Promise<unknown>, frame?: any) {
  const keys = ["window", "document", "navigator", "MutationObserver", "self"];
  const originals = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const dialog = Object.assign(new EventTarget(), { open: true });
  const video = {
    isConnected: true,
    srcObject: null,
    closest: () => dialog,
    play: async () => {},
    readyState: 2,
    videoWidth: frame?.width,
    videoHeight: frame?.height,
  };
  const status = { isConnected: true, textContent: "" };
  const stopButton = { onclick: () => {} };
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: (s: string) =>
      s === "#connection-camera"
        ? video
        : s === "#camera-status"
          ? status
          : stopButton,
    createElement: () => ({
      getContext: () => ({ drawImage: () => {}, getImageData: () => frame }),
    }),
  });
  const values = {
    window: new EventTarget(),
    document,
    navigator: { mediaDevices: { getUserMedia } },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    self: globalThis,
  };
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  const close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  };
  return {
    dialog,
    video,
    status,
    close,
    restore: () => {
      close();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test("scanner releases a camera granted after the dialog was closed", async () => {
  let grant!: (stream: unknown) => void;
  let requested!: () => void;
  const request = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const permission = new Promise((resolve) => {
    grant = resolve;
  });
  let stopped = 0;
  const fixture = setup(() => {
    requested();
    return permission;
  });
  try {
    const running = scanConnectionQR({
      open: () => {},
      close: fixture.close,
      onScan: () => assert.fail("Closed scanner must not deliver a result"),
    });
    await request;
    fixture.close();
    grant({ getTracks: () => [{ stop: () => stopped++ }] });
    await running;
    assert.equal(stopped, 1);
    assert.equal(fixture.video.srcObject, null);
  } finally {
    fixture.restore();
  }
});

test("scanner decodes a frame locally and stops camera before delivering the QR", async () => {
  const data = "https://cho-em.example/#invite=" + "a".repeat(64);
  const image = PNG.sync.read(await QRCode.toBuffer(data, { width: 256 }));
  let stopped = 0,
    received = "";
  const fixture = setup(
    async () => ({ getTracks: () => [{ stop: () => stopped++ }] }),
    {
      data: new Uint8ClampedArray(image.data),
      width: image.width,
      height: image.height,
    },
  );
  try {
    await scanConnectionQR({
      open: () => {},
      close: fixture.close,
      onScan: (raw: string) => {
        assert.equal(stopped, 1);
        received = raw;
      },
    });
    assert.equal(received, data);
    assert.equal(fixture.video.srcObject, null);
  } finally {
    fixture.restore();
  }
});

test("camera permission denial shows a manual-code fallback", async () => {
  const fixture = setup(async () => {
    throw new DOMException("Denied", "NotAllowedError");
  });
  try {
    await scanConnectionQR({
      open: () => {},
      close: fixture.close,
      onScan: () => assert.fail("No camera frame"),
    });
    assert.match(fixture.status.textContent, /nhập mã thủ công/);
    assert.equal(fixture.video.srcObject, null);
  } finally {
    fixture.restore();
  }
});
