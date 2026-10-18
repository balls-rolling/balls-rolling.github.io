// Сетевой мост бильярда (02-d/02-e). Платформенный NetLink обобщённо гоняет
// непрозрачный `Move`; здесь живёт игровая логика: живой поток подготовки, реплей
// входящего удара, синхронный старт удара по сигналу `shot`, shooter-authoritative
// hash + shotSeq, идемпотентность, ожидание результата с таймаутом 5+5 и ресинк.
//
// Модуль без Vue и DOM — прогоняется в node-тестах. Реплей выполняет игра, а не
// мост: мост лишь просит `commitShot` и после применения сверяет хеш.
import type { Move } from "@/core/game";
import type { MoveMeta } from "@/core/net";
import type { Session } from "@/core/session";
import { parseShot, type BilliardsGame } from "@/games/billiards/game";
import type { Shot } from "@/games/billiards/physics";
import {
  deserializeBilliardsState,
  hashBilliardsState,
  type BilliardsState,
} from "@/games/billiards/state";
import { networkRole, type NetRole } from "@/ui/net-recovery";
import type { NetLink } from "@/ui/net/link";
import { parsePrepFrame, systemClock, type PrepClock, type PrepFrame } from "./prep-stream";

export interface BilliardsNetDeps {
  readonly session: Session;
  readonly game: BilliardsGame;
  readonly netLink: NetLink;
  /**
   * Проиграть входящий удар реплеем — тем же циклом, что ход человека
   * (`commitShot` → `startShot` → `advance` → `makeMove` → плашка →
   * `acknowledgeTurn`). Удар уже записан в участника соперника. После применения
   * вызывающий зовёт `afterApplied(playerId, shot)`.
   */
  readonly commitShot: (playerId: string) => void;
  /**
   * Применить отложенный входящий удар (02-e): реплей уже проигран, пришёл
   * авторитетный результат. UI применяет его тем же путём (`makeMove` + плашка).
   */
  readonly applyIncoming?: (playerId: string, shot: Shot) => void;
  /** Плашка ожидания результата: `true` — показать, `false` — снять (02-e). */
  readonly onWaiting?: (waiting: boolean) => void;
  /**
   * Попросить перерисовать основной холст. Основной кадр рисуется по требованию,
   * а не каждый кадр: без этого позиция битка соперника появляется только после
   * сторонней перерисовки (ресайз окна).
   */
  readonly requestDraw?: () => void;
  /** Часы и таймеры (5+5 с) — инжектируются для детерминированных тестов. */
  readonly clock?: PrepClock;
  /** Интервал одного шага ожидания, мс (по умолчанию 5000). */
  readonly waitMs?: number;
}

export interface BilliardsNet {
  /** Роль локальной стороны; `null` — партия не сетевая. */
  readonly role: NetRole;
  /** Подключить хуки игры к мосту и саму сессию к транспорту. */
  attach(): void;
  detach(): void;
  /**
   * Ход игрока `playerId` применён правилами: локальному — отправить партнёру
   * с `seq`+`hash`; входящему — сверить хеш и учесть идемпотентность.
   */
  afterApplied(playerId: string, shot: Shot): void;
  /** Бьющий: сигнал «удар» до локального реплея — `seq` будущего хода. */
  sendShot(shot: Shot): void;
  /**
   * Реплей входящего удара завершён: `"apply"` — применить (02-d), `"hold"` —
   * держаться до авторитетного результата (02-e, таймер 5+5 запущен).
   */
  resolveReplay(): "apply" | "hold";
  /** Отправить кадр подготовки сопернику (коалессер снаружи, задача 2). */
  sendPrep(frame: PrepFrame): void;
}

export function createBilliardsNet(deps: BilliardsNetDeps): BilliardsNet {
  const { session, game, netLink, commitShot } = deps;
  const clock = deps.clock ?? systemClock;
  const waitMs = deps.waitMs ?? 5000;
  const role = networkRole(session);
  const localId = session.snapshot().players.find((p) => p.transport === "local")?.id ?? null;
  const remoteId = session.snapshot().players.find((p) => p.transport === "remote")?.id ?? null;

  /** Идентичность партии (matchId = seed): смена сбрасывает счётчики. */
  let matchSeed: number | null = null;
  /** Последний применённый `seq` на отправителя — идемпотентность. */
  const lastAppliedSeq = new Map<string, number>();
  /** Входящий удар, ожидающий применения после реплея (02-d). */
  let incoming: { shot: Shot; seq?: number; hash?: number } | null = null;
  /** Получен `shot`: реплей идёт/завершён, ждём авторитетный результат (02-e). */
  let awaiting: { shot: Shot; seq?: number; done: boolean } | null = null;
  /** Результат пришёл раньше конца реплея — применяем по его завершении. */
  let awaitingResult: { seq?: number; hash?: number } | null = null;
  /** Таймер ожидания результата (5+5 с). */
  let waitTimer: unknown = null;
  /** Плашка ожидания сейчас показана — не шлём лишних сигналов. */
  let waitingShown = false;

  /** Снять таймеры ожидания и плашку (приход результата, смена хода, финал, detach). */
  function clearWait(): void {
    if (waitTimer !== null) {
      clock.clearTimeout(waitTimer);
      waitTimer = null;
    }
    if (waitingShown) {
      waitingShown = false;
      deps.onWaiting?.(false);
    }
  }

  /** Запустить ожидание результата: 5 с → плашка + resync, ещё 5 с → обрыв. */
  function startWait(): void {
    clearWait();
    waitTimer = clock.setTimeout(() => {
      waitTimer = null;
      waitingShown = true;
      deps.onWaiting?.(true);
      netLink.requestResync();
      waitTimer = clock.setTimeout(() => {
        waitTimer = null;
        // Тот же механизм, что при явном обрыве: признак `peerLeft`.
        netLink.signalPeerUnresponsive();
      }, waitMs);
    }, waitMs);
  }

  /** Состояние из применённого хода (не из реплея) — источник seq/hash. */
  function currentState(): BilliardsState | null {
    const state = deserializeBilliardsState(session.save().gameState);
    if (state && state.seed !== matchSeed) {
      matchSeed = state.seed;
      lastAppliedSeq.clear();
    }
    return state;
  }

  /** Записать чужой удар в участника соперника — источник данных его реплея. */
  function writeRemoteShot(shot: Shot): void {
    if (!remoteId) return;
    game.setParticipantAim(remoteId, shot.angle);
    game.setParticipantPower(remoteId, shot.power);
    // Постановка битка — часть удара (`Move`); данные соперника принимаются без
    // локального гейта (он закрыт на чужом ходе) — см. опыт `ui-behavior` п.15.
    if (typeof shot.cueX === "number" && typeof shot.cueY === "number") {
      game.setParticipantCue(remoteId, shot.cueX, shot.cueY);
    }
  }

  function onRemotePrep(prep: unknown): void {
    const frame = parsePrepFrame(prep);
    if (!frame || !remoteId) return;
    // Живой кадр соперника пишется в его же участника: прицел, сила и биток.
    game.setParticipantAim(remoteId, frame.angle);
    game.setParticipantPower(remoteId, frame.power);
    if (frame.cue) game.setParticipantCue(remoteId, frame.cue.x, frame.cue.y);
    // Состояние участника изменилось вне сессии — просим перерисовку явно.
    deps.requestDraw?.();
  }

  function onRemoteShot(move: Move, seq?: number): boolean {
    const shot = parseShot(move);
    if (!shot) return true; // мусор — молча, но «обработано»
    if (currentState() === null) return true;
    // Дубликат/старый seq реплей не перезапускает; повторный сигнал — no-op.
    if (seq !== undefined && seq <= (lastAppliedSeq.get(remoteId ?? "") ?? 0)) return true;
    if (awaiting) return true;
    awaiting = { shot, seq, done: false };
    writeRemoteShot(shot);
    commitShot(remoteId ?? "");
    return true;
  }

  function onRemoteMove(move: Move, meta: MoveMeta): boolean {
    const shot = parseShot(move);
    // Мусор — молча, но «обработано»: фолбэк на makeMove не нужен.
    if (!shot) return true;
    if (currentState() === null) return true;

    if (awaiting) {
      // Результат по ранее полученному `shot`: применяем отложенный удар.
      if (meta.seq === undefined || awaiting.seq === undefined || meta.seq === awaiting.seq) {
        if (awaiting.done) applyHeld(meta);
        else awaitingResult = { seq: meta.seq, hash: meta.hash };
        return true;
      }
    }

    if (meta.seq !== undefined && meta.seq <= (lastAppliedSeq.get(remoteId ?? "") ?? 0)) {
      return true; // дубликат или устаревший — no-op
    }
    // 02-d-путь (без парного `shot`): реплей и применение по `move`.
    incoming = { shot, seq: meta.seq, hash: meta.hash };
    writeRemoteShot(shot);
    commitShot(remoteId ?? "");
    return true;
  }

  /** Применить отложенный удар (реплей уже завершён) через UI-путь игры. */
  function applyHeld(meta: MoveMeta): void {
    const pending = awaiting;
    if (!pending) return;
    awaiting = null;
    awaitingResult = null;
    clearWait();
    incoming = { shot: pending.shot, seq: pending.seq, hash: meta.hash };
    deps.applyIncoming?.(remoteId ?? "", pending.shot);
  }

  function onStateAdopted(settings: unknown): void {
    if (settings !== undefined) game.applySettings(settings);
    // Снимок хоста: сбрасываем всё сетевое рантайм-состояние и вид чужого прицела.
    awaiting = null;
    awaitingResult = null;
    incoming = null;
    clearWait();
    // Снимок десериализован, но рантайм анимации не тронут: сброс обязателен.
    game.resetRuntime();
    const save = session.save();
    const state = deserializeBilliardsState(save.gameState);
    if (!state) return;
    if (state.seed !== matchSeed) {
      matchSeed = state.seed;
      lastAppliedSeq.clear();
    }
    // `resetRuntime` чистит и `#lastState`: вернуть игре принятое состояние,
    // иначе следующий `startShot` не найдёт базового состояния до кадра.
    game.deserializeState(save.gameState);
    // Хост — источник правды: счётчик входящих ударов выравниваем по снимку.
    if (remoteId) lastAppliedSeq.set(remoteId, state.shotSeq);
  }

  function attach(): void {
    if (role === null || remoteId === null) return;
    netLink.setGameHooks({ onRemoteMove, onRemoteShot, onRemotePrep, onStateAdopted });
    if (role === "host") {
      netLink.setOutgoingState(() => session.save());
      netLink.setOutgoingSettings(() => game.serializeSettings());
    }
    netLink.attach(session);
  }

  function detach(): void {
    clearWait();
    awaiting = null;
    awaitingResult = null;
    incoming = null;
    netLink.setGameHooks(null);
    netLink.setOutgoingState(null);
    netLink.setOutgoingSettings(null);
    netLink.detach();
  }

  function afterApplied(playerId: string, shot: Shot): void {
    const state = currentState();
    if (!state) return;
    clearWait();
    if (playerId === localId) {
      netLink.sendMove({ ...shot }, { seq: state.shotSeq, hash: hashBilliardsState(state) });
      return;
    }
    const pending = incoming;
    incoming = null;
    if (!pending) return;
    if (remoteId) lastAppliedSeq.set(remoteId, pending.seq ?? state.shotSeq);
    if (pending.hash !== undefined && hashBilliardsState(state) !== pending.hash) {
      // Расхождение: хост — источник правды и шлёт снимок сам; гость просит его.
      if (role === "host") netLink.sendState(session.save());
      else netLink.requestResync();
    }
  }

  function sendShot(shot: Shot): void {
    const state = currentState();
    if (!state) return;
    // `seq` будущего хода: `shotSeq` растёт ровно на 1 за удар; авторитетный
    // `move` возьмёт тот же `seq` после применения — по нему и корреляция.
    netLink.sendShot({ ...shot }, state.shotSeq + 1);
  }

  function resolveReplay(): "apply" | "hold" {
    if (!awaiting) return "apply";
    awaiting.done = true;
    if (awaitingResult) {
      // Результат пришёл раньше конца реплея — применяем сейчас.
      const pending = awaiting;
      const result = awaitingResult;
      awaiting = null;
      awaitingResult = null;
      incoming = { shot: pending.shot, seq: pending.seq, hash: result.hash };
      return "apply";
    }
    // Результат ещё не пришёл: держим ход, ждём (таймер 5+5).
    startWait();
    return "hold";
  }

  return {
    role,
    attach,
    detach,
    afterApplied,
    sendShot,
    resolveReplay,
    sendPrep: (frame) => {
      netLink.sendPrep(frame);
    },
  };
}
