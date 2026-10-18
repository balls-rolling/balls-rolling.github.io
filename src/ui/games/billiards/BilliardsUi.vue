<script setup lang="ts">
import { aimLog, aimNow, aimSince } from "@/debug/perf-log";
// UI партии бильярда: подписка на канвас (прицел), сила (слайдер/колесо), кнопка
// удара, панель игроков и инфо-бар хода. Сила и удар — только контроллы UI, канвас
// сам не стреляет (R4). Конец удара для UI — конец реплея (Q7).
import { computed, inject, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
import type { BilliardsGame } from "@/games/billiards/game";
import { BALL_RADIUS } from "@/games/billiards/constants";
import { keyPower, powerFromY, wheelPower } from "@/games/billiards/power";
import { ANGLE_SCALE_PX_PER_DEG, angleAfterScaleDrag, wrap360 } from "@/games/billiards/aim";
import { boardInputKey } from "@/ui/board-input";
import { netLinkKey } from "@/ui/net";
import { sessionHostKey } from "@/ui/session-host";
import { zonesKey } from "@/ui/ui-zones";
import { createBilliardsNet, type BilliardsNet } from "./net";
import { createPrepStream, type PrepStream } from "./prep-stream";

const injectedBoard = inject(boardInputKey);
if (!injectedBoard) throw new Error("Ввод поля не предоставлен");
const board = injectedBoard;
const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const host = injectedHost;
// Слот зон — источник измеренного места панелей (может отсутствовать: тогда
// полоса остаётся нулевой и рейки растягиваются на всю высоту).
const zonesSlot = inject(zonesKey, null);
// Сетевой мост: в локальных партиях транспорта нет, мост не подключается.
const netLink = inject(netLinkKey, null);

const powerPercent = ref(50);

function currentPlayerId(): string | null {
  return host.session.value?.snapshot().currentPlayerId ?? null;
}

/** Id текущего локального участника (ввод открыт); `null` — ход не наш. */
function localPlayerId(): string | null {
  const instance = game();
  if (!instance?.isCurrentLocal()) return null;
  return currentPlayerId();
}

/** Состав из сессии — в игру (имена, агенты, транспорт; чинит `resume`). */
function syncRoster(): void {
  const instance = game();
  const snap = host.session.value?.snapshot();
  if (!instance || !snap) return;
  instance.setRoster(snap.players);
}

/** Показать силу текущего участника на контролле (свою или соперника). */
function syncPowerToCurrent(): void {
  const instance = game();
  const id = currentPlayerId();
  if (!instance || id === null) return;
  powerPercent.value = Math.round(instance.getParticipantPower(id) * 100);
}

/** Записать прицел локального участника (источник ввода — UI). */
function setLocalAim(angle: number | null): void {
  const id = localPlayerId();
  if (id === null) return;
  game()?.setParticipantAim(id, angle);
}

/** Записать силу локального участника (источник ввода — UI). */
function setLocalPower(power: number): void {
  const id = localPlayerId();
  if (id === null) return;
  game()?.setParticipantPower(id, power);
}
/** Вертикальная полоса поля (из инсетов игры): рейки растягиваются в неё. */
const band = ref({ top: 0, bottom: 0 });
/** Показывать числовое значение силы рядом с метром. Здесь скрыто. */
const SHOW_POWER_VALUE = false;
const animating = ref(false);
/**
 * Плашка перехода хода (CONTEXT «Цикл хода»): между ударами показываем, чей
 * ход и почему он перешёл. Появление плашки — момент начала передачи хода;
 * исчезновение отправляет игру в подготовку (`acknowledgeTurn`).
 */
const overlayEl = ref<HTMLCanvasElement | null>(null);
let overlayRaf: number | null = null;
let overlayObserver: ResizeObserver | null = null;

/** Размер холста прицела по корню (совпадает с кадром основного холста). */
function resizeOverlay(): void {
  const el = overlayEl.value;
  const root = rootEl.value;
  if (!el || !root) return;
  const ratio = window.devicePixelRatio || 1;
  const width = root.clientWidth || 1;
  const height = root.clientHeight || 1;
  el.width = Math.round(width * ratio);
  el.height = Math.round(height * ratio);
}

/** Кадр прицела: очистить и нарисовать линию/предпросмотр/стрелки. Без основного холста. */
function overlayFrame(): void {
  overlayRaf = requestAnimationFrame(overlayFrame);
  const el = overlayEl.value;
  const root = rootEl.value;
  const instance = game();
  if (!el || !root || !instance) return;
  // Ход не наш: контролл силы заблокирован и показывает силу текущего участника
  // (её обновляет поток подготовки соперника) — синхронизируем по кадрам.
  if (!instance.isCurrentLocal()) syncPowerToCurrent();
  const ctx = el.getContext("2d");
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  instance.drawAimOverlay(ctx, { width: root.clientWidth || 1, height: root.clientHeight || 1 }, ratio);
}

const turnNotice = ref<string>("");
const turnNoticeWhyText = ref<string>("");
const turnNoticeTimer = ref<number | null>(null);
/** Плашка «Завершение хода другого игрока» (02-e): ждём авторитетный результат. */
const awaitingNotice = ref(false);
/** Сколько плашка перехода висит перед подготовкой следующего хода, мс. */
const TURN_NOTICE_MS = 2000;
const rootEl = ref<HTMLElement | null>(null);
const leftRail = ref<HTMLElement | null>(null);
const rightRail = ref<HTMLElement | null>(null);
const angleDisplay = ref(0);
/** Высота шкалы угла в пикселях — для конечного набора рисок. */
const angleHeight = ref(0);
const angleScaleEl = ref<HTMLElement | null>(null);
/** Риски ленты: конечный набор, мелкие каждые 0.1° (10 px), крупные каждый 1°.
 *  Центр ленты — текущий угол; крупных ровно столько, сколько видно. */
const angleTicks = computed(() => {
  const half = Math.ceil(angleHeight.value / 20) + 2;
  const center = Math.round(angleDisplay.value * 10);
  const ticks: Array<{ k: number; top: number; major: boolean }> = [];
  for (let i = -half; i <= half; i += 1) {
    const k = center + i;
    ticks.push({
      k,
      top: angleHeight.value / 2 + (k / 10 - angleDisplay.value) * ANGLE_SCALE_PX_PER_DEG,
      major: k % 10 === 0,
    });
  }
  return ticks;
});

let detach: (() => void) | null = null;
let unsubscribe: (() => void) | null = null;
let rafId: number | null = null;
let resolutionTimer: number | null = null;
let pendingShot: { readonly playerId: string; readonly move: { angle: number; power: number; cueX?: number; cueY?: number } } | null = null;
let lastTime = 0;
let dragging = false;
let grabbing = false;
let grabOffset = { x: 0, y: 0 };
let blinkId: number | null = null;
let hoverCue = false;
let scaleDragging = false;
let scaleLastY = 0;
let panelObserver: ResizeObserver | null = null;
/** Сетевой мост бильярда; `null` — партия локальная. */
let net: BilliardsNet | null = null;
/** Коалессер потока подготовки (02-e); `null` — партия локальная. */
let prepStream: PrepStream | null = null;

/** Удар/кандидат ИИ: то, что уходит в `startShot` и в `Move`. */
type ComputerShot = { readonly angle: number; readonly power: number; readonly cueX?: number; readonly cueY?: number };
interface ComputerPlan {
  readonly candidates: readonly ComputerShot[];
  readonly chosen: ComputerShot;
}

/**
 * Ход компьютера ведёт UI, а не `Session` (`chooseMove` для бильярда — `null`):
 * иначе удар применился бы мгновенно, минуя реплей, и фаза залипла бы в
 * `passing`. UI берёт план у игры, показывает прицеливание и бьёт тем же путём,
 * что человек (startShot → реплей → makeMove → плашка → acknowledgeTurn).
 */
let computerTimer: number | null = null;
let computerPlan: ComputerPlan | null = null;
let computerStep = 0;
let computerRunning = false;
/** Сколько висит каждый вариант при переборе и пауза перед ударом, мс. */
const COMPUTER_AIM_STEP_MS = 160;
const COMPUTER_PAUSE_MS = 800;

/** Чей ход: агент текущего игрока — компьютер. */
function currentPlayerIsComputer(): boolean {
  const snap = host.session.value?.snapshot();
  if (!snap || snap.state !== "running" || !snap.currentPlayerId) return false;
  const player = snap.players.find((p) => p.id === snap.currentPlayerId);
  return player?.agent === "computer";
}

/**
 * Ход локального участника (задача 4): ввод разрешён только когда текущий
 * участник — локальный человек. ИИ и сетевой соперник блокируют контроллы.
 */
const localTurn = ref(false);

function refreshLocalTurn(): void {
  localTurn.value = game()?.isCurrentLocal() ?? false;
}

/**
 * Гейт потока подготовки (02-e): только на подготовке своего локального хода, не
 * на реплее/плашке/ходе соперника/в завершённой партии и только при открытом
 * канале. Иначе поток уходит в пустоту.
 */
function prepGateOpen(instance: BilliardsGame): boolean {
  if (!net) return false;
  if (!localTurn.value || turnNotice.value !== "" || awaitingNotice.value) return false;
  if (instance.isAnimating()) return false;
  if (instance.getTurnPhase() !== "preparing") return false;
  if (netLink?.transport.value?.state !== "open") return false;
  const session = host.session.value;
  return session !== null && session.snapshot().state === "running";
}

/** Отправить живой кадр подготовки: угол, сила, позиция битка (коалессер внутри). */
function pushPrep(): void {
  if (!prepStream) return;
  const instance = game();
  if (!instance || !prepGateOpen(instance)) return;
  const placement = instance.getCuePlacement();
  prepStream.push({
    angle: instance.getAim() ?? instance.defaultAim(),
    power: instance.getPreviewPower(),
    cue: placement ? { x: placement.x, y: placement.y } : null,
  });
}

/** Выставить прицел и силу ИИ у его участника — тем же путём, что у человека. */
function applyComputerAim(angle: number, power: number): void {
  const instance = game();
  const id = currentPlayerId();
  if (!instance || id === null) return;
  instance.setParticipantAim(id, angle);
  instance.setParticipantPower(id, power);
  powerPercent.value = Math.round(power * 100);
  syncAngle();
  board.requestDraw.value?.();
}

/** Запустить ход компьютера, если сейчас его очередь и стол готов. */
function maybeStartComputerTurn(): void {
  if (computerRunning || computerTimer !== null) return;
  const instance = game();
  if (!instance) return;
  if (!currentPlayerIsComputer()) return;
  if (instance.isAnimating()) return;
  // Прицел возможен только на подготовке; плашка перехода ещё держит стол.
  if (instance.getTurnPhase() !== "preparing") return;
  if (turnNotice.value !== "") return;
  const plan = instance.planComputerTurn?.() ?? null;
  if (!plan) return; // нет удара — не залипаем: игра не в состоянии хода
  startComputerTurn(plan);
}

function startComputerTurn(plan: ComputerPlan): void {
  const instance = game();
  if (!instance) return;
  computerRunning = true;
  computerPlan = plan;
  computerStep = 0;
  // Биток с руки: ИИ сам ставит его на подготовке, до удара (CONTEXT «Цикл хода»).
  const chosen = plan.chosen;
  if (typeof chosen.cueX === "number" && typeof chosen.cueY === "number") {
    instance.setCuePlacement(chosen.cueX, chosen.cueY);
    pushPrep();
    board.requestDraw.value?.();
  }
  showNextComputerCandidate();
}

/** Перебор вариантов: прицел переключается и останавливается на выбранном. */
function showNextComputerCandidate(): void {
  const plan = computerPlan;
  if (!plan) return;
  if (computerStep < plan.candidates.length) {
    const candidate = plan.candidates[computerStep]!;
    computerStep += 1;
    applyComputerAim(candidate.angle, candidate.power);
    computerTimer = window.setTimeout(showNextComputerCandidate, COMPUTER_AIM_STEP_MS);
    return;
  }
  applyComputerAim(plan.chosen.angle, plan.chosen.power);
  computerTimer = window.setTimeout(fireComputerShot, COMPUTER_PAUSE_MS);
}

function fireComputerShot(): void {
  computerTimer = null;
  const plan = computerPlan;
  computerPlan = null;
  computerRunning = false;
  if (!plan) return;
  const id = currentPlayerId();
  if (id === null) return;
  // Прицел/сила/биток уже записаны в участника компьютера — бьём его ходом.
  beginShot(id);
}

function game(): BilliardsGame | null {
  const instance = host.game.value as unknown as BilliardsGame | null;
  // Структурная проверка, а не instanceof: после HMR модуль может раздвоиться,
  // и instanceof даёт ложный минус — тогда UI теряет игру.
  if (
    instance &&
    typeof instance.startShot === "function" &&
    typeof instance.advance === "function" &&
    typeof instance.setAim === "function" &&
    typeof instance.setParticipantAim === "function" &&
    typeof instance.getCuePosition === "function"
  ) {
    return instance;
  }
  return null;
}

function angleFromEvent(event: PointerEvent): number | null {
  const canvas = board.canvas.value;
  const instance = game();
  if (!canvas || !instance) return null;
  const cue = instance.getCuePosition();
  if (!cue) return null;
  const rect = canvas.getBoundingClientRect();
  const fit = instance.getFit({ width: rect.width, height: rect.height });
  const cueX = fit.offsetX + cue.x * fit.scale;
  const cueY = fit.offsetY + cue.y * fit.scale;
  return Math.atan2(event.clientY - rect.top - cueY, event.clientX - rect.left - cueX);
}

/** Текст причины передачи хода — тем же словами, что и в правилах. */
const TURN_REASON_TEXT: Record<string, string> = {
  initial: "Начало партии",
  break: "после разбития",
  foul: "фол",
  pottedOwn: "забил свой — продолжает",
  pottedOther: "забил чужой",
  noPocket: "ничего не забил",
};

/** Плашка: имя ходящего крупно, причина — второй строкой. */
function turnNoticeText(playerName: string): string {
  return `Ход: ${playerName}`;
}

function turnNoticeWhy(reason: string): string {
  return TURN_REASON_TEXT[reason] ?? reason;
}

/**
 * Показать/обновить плашку перехода. Возвращает `true`, если игра ждёт
 * подтверждения (плашка видима) — тогда подготовка следующего хода ещё не идёт.
 */
function refreshTurnNotice(): boolean {
  const instance = game();
  const handoff = instance?.getTurnHandoff?.() ?? null;
  if (!instance || !handoff) {
    // Партия окончена или передачи нет: если фаза застряла, подготовка
    // обязана начаться — иначе стол нельзя целить (страховка от залипания).
    if (instance && !handoff && instance.getTurnPhase() === "passing") {
      instance.acknowledgeTurn();
    }
    if (turnNoticeTimer.value !== null) {
      window.clearTimeout(turnNoticeTimer.value);
      turnNoticeTimer.value = null;
    }
    if (turnNotice.value !== "") {
      turnNotice.value = "";
      turnNoticeWhyText.value = "";
    }
    return false;
  }
  const name = instance.playerName(handoff.playerId);
  const text = turnNoticeText(name);
  if (turnNotice.value !== text) {
    turnNotice.value = text;
    turnNoticeWhyText.value = turnNoticeWhy(handoff.reason);
  }
  return true;
}

/** Плашка исчезла — начинается подготовка следующего хода. */
function endTurnNotice(): void {
  turnNotice.value = "";
  turnNoticeWhyText.value = "";
  game()?.acknowledgeTurn?.();
  board.requestDraw.value?.();
  ensureBlink();
  // Сила — своя у каждого участника: контролл показывает силу текущего.
  syncPowerToCurrent();
  // Следующий ход мог достаться компьютеру (забил свой — продолжает) или
  // удалённому игроку: блокировка и ход ИИ решаются по текущему участнику.
  refreshLocalTurn();
  // Подготовка своего хода началась — соперник должен увидеть первый кадр.
  prepStream?.setEnabled(true);
  pushPrep();
  maybeStartComputerTurn();
}

/** Клик по плашке убирает её досрочно — читать 2 секунды не обязательно. */
function dismissTurnNotice(): void {
  if (turnNotice.value === "") return;
  if (turnNoticeTimer.value !== null) {
    window.clearTimeout(turnNoticeTimer.value);
    turnNoticeTimer.value = null;
  }
  endTurnNotice();
}

function showTurnNotice(): void {
  if (!refreshTurnNotice()) return;
  if (turnNoticeTimer.value !== null) window.clearTimeout(turnNoticeTimer.value);
  turnNoticeTimer.value = window.setTimeout(() => {
    turnNoticeTimer.value = null;
    endTurnNotice();
  }, TURN_NOTICE_MS);
}

function tick(now: number): void {
  rafId = null;
  const instance = game();
  if (!instance || !instance.isAnimating()) {
    animating.value = false;
    scheduleMoveResolution();
    return;
  }
  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  const still = instance.advance(dt);
  animating.value = still;
  board.requestDraw.value?.();
  if (still) {
    rafId = requestAnimationFrame(tick);
    return;
  }
  // Результаты удара применяются только после полного реплея и небольшой паузы.
  scheduleMoveResolution();
}

/** Применить результат уже завершённого реплея после короткой паузы. */
function scheduleMoveResolution(): void {
  if (!pendingShot || resolutionTimer !== null) return;
  resolutionTimer = window.setTimeout(() => {
    resolutionTimer = null;
    const pending = pendingShot;
    pendingShot = null;
    const session = host.session.value;
    const instance = game();
    if (!pending || !session || !instance) return;
    // Сетевой приёмник, получивший `shot` (02-e): реплей проигран, но удар не
    // применяем — держим ход до авторитетного результата партнёра.
    if (net && net.resolveReplay() === "hold") return;
    const accepted = session.makeMove(pending.playerId, pending.move);
    if (!accepted) {
      instance.resetRuntime();
      board.requestDraw.value?.();
      return;
    }
    // Сеть (02-d): локальный удар уходит партнёру с seq+hash; входящий —
    // сверяется по хешу. Ход берём из `makeMove`, реплей — только визуальный.
    net?.afterApplied(pending.playerId, pending.move);
    // Теперь состояние/очередь/результат обновлены правилами; затем — плашка.
    board.requestDraw.value?.();
    showTurnNotice();
  }, 350);
}

function ensureLoop(): void {
  const instance = game();
  if (!instance || !instance.isAnimating() || rafId !== null) return;
  animating.value = true;
  lastTime = 0;
  rafId = requestAnimationFrame(tick);
}

function worldFromEvent(event: PointerEvent): { x: number; y: number } | null {
  const canvas = board.canvas.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const instance = game();
  if (!instance) return null;
  const fit = instance.getFit({ width: rect.width, height: rect.height });
  return {
    x: (event.clientX - rect.left - fit.offsetX) / fit.scale,
    y: (event.clientY - rect.top - fit.offsetY) / fit.scale,
  };
}

/** Текущий угол прицела в градусах [0,360). */
function syncAngle(): void {
  const instance = game();
  const rad = instance?.getAim() ?? instance?.defaultAim() ?? 0;
  angleDisplay.value = wrap360((rad * 180) / Math.PI);
}

function onScaleDown(event: PointerEvent): void {
  if (event.button !== 0 || !localTurn.value) return;
  scaleDragging = true;
  scaleLastY = event.clientY;
  try {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  } catch {
    /* синтетический указатель без активного пойнтера — тянем без захвата */
  }
}

function onScaleMove(event: PointerEvent): void {
  if (!scaleDragging || !localTurn.value) return;
  const instance = game();
  if (!instance || instance.isAnimating()) return;
  const dy = event.clientY - scaleLastY;
  scaleLastY = event.clientY;
  const current = instance.getAim() ?? instance.defaultAim() ?? 0;
  // Тянем ленту вниз: смещение в пикселях → поворот на долю градуса.
  setLocalAim(angleAfterScaleDrag(current, dy));
  syncAngle();
  pushPrep();
  board.requestDraw.value?.();
}

function onScaleUp(event: PointerEvent): void {
  if (!scaleDragging) return;
  scaleDragging = false;
  try {
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
  } catch {
    /* уже отпущен */
  }
}

/** Запас по бокам под вертикальные панели игры: берём расстояние от края
 *  кадра до внутренней кромки рейки (рейка стоит с отступом от края). */
function measurePanel(): void {
  const instance = game();
  const canvasRect = board.canvas.value?.getBoundingClientRect();
  if (!instance || !canvasRect) return;
  const leftRect = leftRail.value?.getBoundingClientRect();
  const rightRect = rightRail.value?.getBoundingClientRect();
  instance.setPanelInsets({
    left: leftRect ? Math.max(0, Math.round(leftRect.right - canvasRect.left)) : 0,
    right: rightRect ? Math.max(0, Math.round(canvasRect.right - rightRect.left)) : 0,
  });
  const insets = instance.getInsets();
  band.value = { top: insets.top, bottom: insets.bottom };
  board.requestDraw.value?.();
}

function placeCueAt(event: PointerEvent): void {
  const instance = game();
  if (!instance || instance.isAnimating()) return;
  const world = worldFromEvent(event);
  if (!world) return;
  instance.setCuePlacement(world.x + grabOffset.x, world.y + grabOffset.y);
  pushPrep();
  board.requestDraw.value?.();
}

/** Курсор наведён на биток (для яркости стрелок и захвата). */
function cueUnderPointer(event: PointerEvent): boolean {
  const instance = game();
  if (!instance) return false;
  const cue = instance.getCuePosition();
  const world = worldFromEvent(event);
  if (!cue || !world) return false;
  return Math.hypot(world.x - cue.x, world.y - cue.y) <= BALL_RADIUS * 1.6;
}

/** Мигание стрелок перемещения, пока оно доступно. */
function blinkTick(now: number): void {
  blinkId = null;
  const instance = game();
  if (!instance || !instance.canMove() || instance.isMoving()) return;
  instance.setBlink((Math.sin(now / 320) + 1) / 2);
  blinkId = requestAnimationFrame(blinkTick);
}

function ensureBlink(): void {
  const instance = game();
  if (!instance || !instance.canMove() || instance.isMoving() || blinkId !== null) return;
  blinkId = requestAnimationFrame(blinkTick);
}

/**
 * Общий путь удара (человек, компьютер, сетевой приём): просим у игры удар от
 * имени участника — `commitShot` читает его прицел/силу/биток и стартует реплей.
 */
function beginShot(playerId: string, options?: { readonly fromRemote?: boolean }): void {
  const instance = game();
  const session = host.session.value;
  if (!instance || !session || instance.isAnimating()) return;
  // Между ударами стол не трогаем: удар возможен только на подготовке хода.
  if (instance.getTurnPhase() === "passing") return;
  const shot = instance.commitShot(playerId);
  if (!shot) return;
  // Удар принят. Сигнал «удар» уходит до первого кадра реплея (реплей шагает по
  // кадрам, `advance` ещё не звался) — оба стартуют вместе; приёмник (`fromRemote`)
  // свой сигнал не повторяет. Шлём только после успешного старта, иначе приёмник
  // напрасно ждал бы авторитетный результат.
  if (net && !options?.fromRemote && instance.isCurrentLocal()) {
    net.sendShot(shot);
  }
  // Удар начался: поток подготовки молчит (в т.ч. отменяем запланированный хвост).
  prepStream?.setEnabled(false);
  // Session и правила не получают ход до конца реплея + короткой паузы: поле,
  // очередь и результат меняются вместе, только после завершения удара.
  pendingShot = { playerId, move: shot };
  syncAngle();
  board.requestDraw.value?.();
  if (instance.isAnimating()) ensureLoop();
  else scheduleMoveResolution();
}

function shoot(): void {
  const id = localPlayerId();
  if (id === null) return;
  setLocalPower(powerPercent.value / 100);
  beginShot(id);
}

function aimAt(event: PointerEvent): void {
  const instance = game();
  if (!instance) {
    animating.value = false;
    return;
  }
  animating.value = instance.isAnimating();
  if (instance.isAnimating()) return;
  const angle = angleFromEvent(event);
  if (angle === null) return;
  setLocalAim(angle);
  syncAngle();
  pushPrep();
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const canvas = board.canvas.value;
  const instance = game();
  if (!canvas || !instance || instance.isAnimating() || !localTurn.value) return;
  dragging = true;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* захват недоступен — не критично */
  }
  // Взяли биток — начинаем перемещение, прицел выключается. Захват только за сам
  // шар: клик в любом другом месте поля целит (как в начале партии), даже когда
  // перемещение доступно. Тянем с сохранением смещения.
  if (instance.canMove() && cueUnderPointer(event)) {
    const cue = instance.getCuePosition();
    const world = worldFromEvent(event);
    grabbing = true;
    grabOffset = cue && world ? { x: cue.x - world.x, y: cue.y - world.y } : { x: 0, y: 0 };
    instance.setCueHover(true);
    instance.startMove();
    placeCueAt(event);
    return;
  }
  aimAt(event);
}

let lastMoveAt = 0;
function onPointerMove(event: PointerEvent): void {
  const m0 = aimNow();
  const cuePos = game()?.getCuePosition() ?? null;
  aimLog("pm", {
    cue: cuePos ? [Math.round(cuePos.x), Math.round(cuePos.y)] : null,
    aim: game()?.getAim() ?? null,
    sinceLast: Math.round((m0 - lastMoveAt) * 100) / 100,
    queued: Math.round((m0 - event.timeStamp) * 100) / 100,
    coalesced: event.getCoalescedEvents ? event.getCoalescedEvents().length : 1,
    dragging,
  });
  lastMoveAt = m0;
  handlePointerMove(event);
  aimLog("pmdone", { ms: aimSince(m0) });
}

function handlePointerMove(event: PointerEvent): void {
  const instance = game();
  if (!instance) return;
  if (grabbing) {
    placeCueAt(event);
    return;
  }
  if (dragging) {
    aimAt(event);
    return;
  }
  // Без нажатия — подсветка битка, если перемещение доступно.
  const over = instance.canMove() && cueUnderPointer(event);
  if (over !== hoverCue) {
    hoverCue = over;
    instance.setCueHover(over);
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  try {
    board.canvas.value?.releasePointerCapture(event.pointerId);
  } catch {
    /* уже отпущен */
  }
  if (grabbing) {
    grabbing = false;
    const instance = game();
    instance?.endMove();
    // После перемещения прицел снова на цель.
    setLocalAim(null);
    syncAngle();
    pushPrep();
    board.requestDraw.value?.();
  }
}

function onPointerCancel(): void {
  // Жест отменён браузером — перемещение/наведение прекращается, выстрела нет.
  dragging = false;
  if (grabbing) {
    grabbing = false;
    const instance = game();
    instance?.endMove();
    setLocalAim(null);
    pushPrep();
  }
}

function onPointerLeave(): void {
  if (hoverCue) {
    hoverCue = false;
    game()?.setCueHover(false);
    board.requestDraw.value?.();
  }
}

function sendPowerPreview(): void {
  // Сила хранится у участника: записываем локальному (контролл открыт только на его ходу).
  setLocalPower(powerPercent.value / 100);
  pushPrep();
  board.requestDraw.value?.();
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  if (animating.value || !localTurn.value) return;
  powerPercent.value = wheelPower(powerPercent.value, event.deltaY);
  sendPowerPreview();
}

// --- Ползунок силы: кастомный контролл (цвет заливки и числа от значения) ---

let powerDragging = false;

function setPowerFromPointer(clientY: number, el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  // Вертикальный метр: снизу 0, сверху 100 — правило в `power.ts`.
  powerPercent.value = powerFromY(clientY, rect.top, rect.height);
  sendPowerPreview();
}

function onPowerDown(event: PointerEvent): void {
  if (event.button !== 0 || animating.value || !localTurn.value) return;
  powerDragging = true;
  const el = event.currentTarget as HTMLElement;
  try {
    el.setPointerCapture(event.pointerId);
  } catch {
    /* синтетический указатель — ведём без захвата */
  }
  setPowerFromPointer(event.clientY, el);
}

function onPowerMove(event: PointerEvent): void {
  if (!powerDragging) return;
  setPowerFromPointer(event.clientY, event.currentTarget as HTMLElement);
}

function onPowerUp(event: PointerEvent): void {
  if (!powerDragging) return;
  powerDragging = false;
  try {
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
  } catch {
    /* уже отпущен */
  }
}

function onPowerKey(event: KeyboardEvent): void {
  if (animating.value || !localTurn.value) return;
  const next = keyPower(powerPercent.value, event.key, event.shiftKey);
  if (next === null) return;
  powerPercent.value = next;
  sendPowerPreview();
  event.preventDefault();
}

function attach(canvas: HTMLCanvasElement | null): void {
  detach?.();
  detach = null;
  if (!canvas) return;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  detach = () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
  };
}

onMounted(() => {
  animating.value = game()?.isAnimating() ?? false;
  // Состав из сессии — до чтения текущего участника и блокировки ввода.
  syncRoster();
  game()?.setAim(null); // прицел по умолчанию — на целевой шар
  syncAngle();
  measurePanel();
  if (angleScaleEl.value) angleHeight.value = angleScaleEl.value.clientHeight;
  if (rootEl.value && typeof ResizeObserver !== "undefined") {
    panelObserver = new ResizeObserver(() => {
      measurePanel();
      if (angleScaleEl.value) angleHeight.value = angleScaleEl.value.clientHeight;
    });
    panelObserver.observe(rootEl.value);
  }
  // Замер верха опаздывает за слоем (слой меряет меню/игроков/колокольчик позже
  // монтирования игры): перемеряем на следующем тике, при каждом изменении
  // сессии и при ресайзе окна — иначе рейки залезают под верхнюю панель.
  void nextTick(() => measurePanel());
  window.addEventListener("resize", measurePanel);
  // Инсеты приходят в слот реактивно (см. `LayerGameUi`): пересчёт полосы —
  // по подписке, без копии измерения здесь.
  watch(() => zonesSlot?.insets.value, () => measurePanel());
  ensureBlink();
  game()?.setOverlayAim(true);
  board.requestDraw.value?.();
  resizeOverlay();
  if (rootEl.value && typeof ResizeObserver !== "undefined") {
    overlayObserver = new ResizeObserver(resizeOverlay);
    overlayObserver.observe(rootEl.value);
  }
  overlayFrame();
  syncPowerToCurrent();
  refreshLocalTurn();
  maybeStartComputerTurn();
  // Сетевая партия: подключаем мост к сессии (для локальных — транспорта нет).
  const session = host.session.value;
  const instance = game();
  if (session && instance && netLink?.transport.value) {
    net = createBilliardsNet({
      session,
      game: instance,
      netLink,
      // Входящий удар: мост уже записал его в участника соперника — играет реплей.
      commitShot: (playerId) => beginShot(playerId, { fromRemote: true }),
      // Кадр подготовки соперника меняет вид вне сессии — перерисовываем холст.
      requestDraw: () => board.requestDraw.value?.(),
      // Отложенный входящий удар (02-e): реплей проигран, пришёл результат.
      applyIncoming: (playerId, shot) => {
        const s = host.session.value;
        const gameInstance = game();
        if (!s || !gameInstance) return;
        if (s.makeMove(playerId, { ...shot })) {
          net?.afterApplied(playerId, shot);
          board.requestDraw.value?.();
          showTurnNotice();
        } else {
          gameInstance.resetRuntime();
          board.requestDraw.value?.();
        }
      },
      onWaiting: (waiting) => {
        awaitingNotice.value = waiting;
      },
    });
    net.attach();
    prepStream = createPrepStream((frame) => net?.sendPrep(frame));
    pushPrep();
  }
  if (host.session.value) {
    unsubscribe = host.session.value.subscribe(() => {
      measurePanel();
      // Q7: пока идёт реплей, панель/ход не обновляем — синхронизируем по его концу.
      if (game()?.isAnimating()) return;
      // Состав мог смениться (resume): обновляем имена/агентов/транспорт.
      syncRoster();
      syncAngle();
      syncPowerToCurrent();
      board.requestDraw.value?.();
      ensureBlink();
      refreshLocalTurn();
      maybeStartComputerTurn();
    });
  }
});

// Канвас появляется из слоя поля; подписываемся, когда он доступен.
watch(board.canvas, (canvas) => attach(canvas), { immediate: true });

onScopeDispose(() => {
  detach?.();
  unsubscribe?.();
  prepStream?.reset();
  prepStream = null;
  net?.detach();
  net = null;
  awaitingNotice.value = false;
  window.removeEventListener("resize", measurePanel);
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (resolutionTimer !== null) window.clearTimeout(resolutionTimer);
  if (computerTimer !== null) window.clearTimeout(computerTimer);
  computerTimer = null;
  computerPlan = null;
  computerRunning = false;
  pendingShot = null;
  if (blinkId !== null) cancelAnimationFrame(blinkId);
  panelObserver?.disconnect();
  overlayObserver?.disconnect();
  if (overlayRaf !== null) cancelAnimationFrame(overlayRaf);
  game()?.setOverlayAim(false);
});
</script>

<template>
  <div
    ref="rootEl"
    class="billiards-ui"
    :style="{ paddingTop: `${band.top}px`, paddingBottom: `${band.bottom}px` }"
  >
    <canvas ref="overlayEl" class="billiards-ui__overlay" aria-hidden="true" />
    <div ref="leftRail" class="billiards-ui__rail billiards-ui__rail--left">
      <div
        ref="angleScaleEl"
        class="billiards-ui__angle"
        role="slider"
        aria-label="Точный угол удара"
        :aria-valuenow="Math.round(angleDisplay)"
        aria-valuemin="0"
        aria-valuemax="359"
        @pointerdown="onScaleDown"
        @pointermove="onScaleMove"
        @pointerup="onScaleUp"
        @pointercancel="onScaleUp"
      >
        <div class="billiards-ui__angle-ticks">
          <span
            v-for="tick in angleTicks"
            :key="tick.k"
            class="billiards-ui__angle-tick"
            :class="{ 'billiards-ui__angle-tick--major': tick.major }"
            :style="{ top: `${tick.top}px` }"
          />
        </div>
        <div class="billiards-ui__angle-mark" />
      </div>
    </div>

    <div ref="rightRail" class="billiards-ui__rail billiards-ui__rail--right">
      <button
        class="billiards-ui__shoot"
        type="button"
        :disabled="animating || !localTurn"
        aria-label="Удар"
        @click="shoot"
      >
        SHOOT
      </button>
      <div
        class="billiards-ui__power-meter"
        :class="{ 'is-disabled': animating || !localTurn }"
        role="slider"
        tabindex="0"
        aria-label="Сила удара"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="powerPercent"
        :aria-disabled="animating || !localTurn"
        @pointerdown="onPowerDown"
        @pointermove="onPowerMove"
        @pointerup="onPowerUp"
        @pointercancel="onPowerUp"
        @keydown="onPowerKey"
      >
        <div class="billiards-ui__power-gray" :style="{ bottom: `${powerPercent}%` }" />
        <div class="billiards-ui__power-marker" :style="{ bottom: `${powerPercent}%` }" />
      </div>
      <span v-if="SHOW_POWER_VALUE" class="billiards-ui__power-value">{{ powerPercent }}</span>
      <button class="billiards-ui__feints" type="button" disabled aria-label="Финты">Финты</button>
    </div>

    <!-- Плашка перехода хода: чей ход и почему перешёл (CONTEXT «Цикл хода»). -->
    <div
      v-if="turnNotice"
      class="billiards-ui__turn"
      role="status"
      @pointerdown="dismissTurnNotice"
    >
      <span class="billiards-ui__turn-name">{{ turnNotice }}</span>
      <span class="billiards-ui__turn-why">{{ turnNoticeWhyText }}</span>
    </div>

    <!-- Ожидание результата удара соперника (02-e): нет ответа 5 с. -->
    <div v-if="awaitingNotice && !turnNotice" class="billiards-ui__await" role="status">
      <span class="billiards-ui__await-text">Завершение хода другого игрока</span>
    </div>
  </div>
</template>

<style scoped>
/* Холст прицела: поверх стола, не перехватывает указатель. */
.billiards-ui__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
/* Панели игры — вертикальные рейки по бокам: слева тонкая подстройка угла,
   справа (сверху вниз) удар, сила и финты. */
/* Плашка перехода хода — крупная, по центру стола: имя ходящего крупно,
   причина мельче. Появляется мягким проявлением; клик по самой плашке
   убирает её досрочно, остальной стол под ней ввода не перехватывает. */
.billiards-ui__turn {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: min(46vw, 420px);
  padding: var(--space-4, 12px) var(--space-6, 20px);
  border-radius: 14px;
  background: color-mix(in oklab, var(--surface-1, #101418) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent, #0075ff) 45%, transparent);
  color: var(--text-1, #f2f5f7);
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 12px 40px rgb(0 0 0 / 55%);
  animation: billiards-turn-in 220ms ease-out;
}
.billiards-ui__turn-name {
  font-size: clamp(20px, 3vw, 30px);
  font-weight: 700;
  letter-spacing: 0.01em;
  text-align: center;
}
.billiards-ui__turn-why {
  font-size: clamp(12px, 1.4vw, 15px);
  opacity: 0.75;
}
@keyframes billiards-turn-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
/* Плашка ожидания результата соперника (02-e) — тот же вид, что у перехода хода. */
.billiards-ui__await {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: min(46vw, 420px);
  padding: var(--space-4, 12px) var(--space-6, 20px);
  border-radius: 14px;
  background: color-mix(in oklab, var(--surface-1, #101418) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent, #0075ff) 45%, transparent);
  color: var(--text-1, #f2f5f7);
  pointer-events: none;
  box-shadow: 0 12px 40px rgb(0 0 0 / 55%);
  animation: billiards-turn-in 220ms ease-out;
}
.billiards-ui__await-text {
  font-size: clamp(16px, 2.2vw, 24px);
  font-weight: 700;
  text-align: center;
}
/* Сетка: две рейки одинаковой ширины по краям и поле посередине. Рейки растягиваются
   по высоте полосы поля (padding сверху/снизу задаёт инсеты игры). Симметрия даёт
   равенство колонок, а не подгонка чисел. */
.billiards-ui {
  --rail-w: 64px;
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr) var(--rail-w);
  grid-template-rows: minmax(0, 1fr);
  padding-left: var(--shell-pad-left);
  padding-right: var(--shell-pad-right);
  pointer-events: none;
}
.billiards-ui__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  min-height: 0;
  /* Контроллы не упираются в края полосы: внутренние отступы сверху и снизу. */
  padding-block: var(--space-5);
  pointer-events: auto;
}
.billiards-ui__rail--left {
  grid-column: 1;
}
.billiards-ui__rail--right {
  grid-column: 3;
}
/* Кнопка — не растягивается: занимает размер своего содержимого. */
.billiards-ui__shoot {
  flex: none;
  width: var(--rail-w);
  height: var(--rail-w);
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: color-mix(in oklch, var(--accent) 25%, var(--surface-2));
  color: var(--fg);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
}
.billiards-ui__shoot:disabled {
  opacity: 0.5;
}
.billiards-ui__feints {
  flex: none;
  width: var(--rail-w);
  height: var(--rail-w);
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--on-surface-variant);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  opacity: 0.5;
}
/* Метр — растягивается по всей свободной высоте рейки (flex: 1), ширина — как у шкалы угла.
   Единый градиент — фоном самого метра на всю высоту; верхнюю часть закрывает
   серая зона на якорях (top: 0, низ — по значению), как и ползунок. Маска «плашек» —
   одна на весь метр, поэтому серое и цветное режутся одинаково. Цвет не масштабируется. */
.billiards-ui__power-meter {
  position: relative;
  flex: 1 1 auto;
  width: 28px;
  min-height: 0;
  overflow: hidden;
  border-radius: 4px;
  background: linear-gradient(
    in oklch 0deg,
    oklch(0.72 0.18 150),
    oklch(0.75 0.19 80),
    oklch(0.62 0.22 28)
  );
  -webkit-mask-image: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 8px);
  mask-image: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 8px);
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.billiards-ui__power-meter:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.billiards-ui__power-meter.is-disabled {
  opacity: 0.6;
  cursor: default;
}
.billiards-ui__power-gray {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* Серый непрозрачный: оба конца смеси непрозрачны, поэтому яркий градиент
     не светит сквозь зону (в тёмной теме --surface-2 полупрозрачен). */
  background: color-mix(in oklch, var(--fg) 25%, var(--bg));
}
/* Ползунок: шире шкалы и с тёмной обводкой — виден на любом фоне. */
.billiards-ui__power-marker {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  transform: translateY(50%);
  border-radius: 2px;
  background: var(--fg);
  box-shadow: 0 0 0 1px oklch(0.15 0 0 / 0.8);
  pointer-events: none;
}
.billiards-ui__power-value {
  min-width: 3ch;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.billiards-ui__angle {
  position: relative;
  flex: 1 1 auto;
  width: 28px;
  min-height: 0;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in oklch, var(--surface-2) 55%, var(--border));
  border: 1px solid var(--border);
  cursor: grab;
  touch-action: none;
}
.billiards-ui__angle:active {
  cursor: grabbing;
}
.billiards-ui__angle-ticks {
  position: absolute;
  inset: 0;
  opacity: 0.85;
}
/* Риски ленты — конечный набор: мелкие 1px каждые 0.1°, крупные 2px каждый 1°.
   Бесконечной повторяющейся заливки нет, поэтому задвоенных линий не бывает. */
.billiards-ui__angle-tick {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-50%);
  background: var(--border);
}
.billiards-ui__angle-tick--major {
  height: 2px;
  background: var(--fg);
}
.billiards-ui__angle-mark {
  position: absolute;
  left: -2px;
  right: -2px;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  background: var(--accent);
}
</style>
