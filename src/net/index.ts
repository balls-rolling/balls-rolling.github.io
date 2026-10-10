// WebRTC-слой платформы: конкретная реализация канала. Здесь допустимы DOM и
// WebRTC (этот каталог вне `core`/`games`).
export { startHost, startGuest } from "./webrtc";
export type { HostHandle, GuestHandle } from "./webrtc";
