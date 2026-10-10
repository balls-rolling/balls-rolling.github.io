<script setup lang="ts">
// Сканер QR по нативному `BarcodeDetector` (прогрессивное улучшение). Если API
// нет (Firefox/Safari) — компонент ничего не показывает; без сторонней библиотеки.
import { onScopeDispose, ref } from "vue";

const props = defineProps<{ onScan: (text: string) => void }>();

interface DetectedBarcode {
  readonly rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<readonly DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: readonly string[] }) => BarcodeDetectorLike;

const api = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
const supported = typeof api === "function";

const video = ref<HTMLVideoElement | null>(null);
const active = ref(false);
const error = ref("");
let stream: MediaStream | null = null;
let frame: number | null = null;
let detector: BarcodeDetectorLike | null = null;

async function start(): Promise<void> {
  if (!supported) return;
  error.value = "";
  try {
    detector = new api!({ formats: ["qr_code"] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const element = video.value;
    if (!element) return;
    element.srcObject = stream;
    await element.play();
    active.value = true;
    void loop();
  } catch {
    error.value = "Не удалось получить доступ к камере";
    stop();
  }
}

async function loop(): Promise<void> {
  if (!active.value || !video.value || !detector) return;
  try {
    const codes = await detector.detect(video.value);
    if (codes.length > 0) {
      stop();
      props.onScan(codes[0]!.rawValue);
      return;
    }
  } catch {
    /* кадр не распознан — продолжаем */
  }
  frame = requestAnimationFrame(() => void loop());
}

function stop(): void {
  active.value = false;
  if (frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

onScopeDispose(stop);
</script>

<template>
  <div v-if="supported" class="qr-scanner">
    <video
      ref="video"
      class="qr-scanner__video"
      :class="{ 'qr-scanner__video--on': active }"
      playsinline
      muted
    />
    <button v-if="!active" class="btn btn--secondary btn--sm" type="button" @click="start">
      <span class="btn__label">Сканировать QR</span>
    </button>
    <p v-else class="text-muted">Наведите камеру на QR-код…</p>
    <p v-if="error" class="text-muted">{{ error }}</p>
  </div>
</template>

<style scoped>
.qr-scanner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.qr-scanner__video {
  display: none;
  width: 100%;
  max-width: 260px;
  border-radius: var(--r-md);
  background: #000;
}

.qr-scanner__video--on {
  display: block;
}
</style>
