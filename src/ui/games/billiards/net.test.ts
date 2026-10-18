import { describe, expect, it } from "vitest";
import type { MessageListener, StateListener, Transport, TransportState } from "@/core/net";
import { Session } from "@/core/session";
import { chooseShot } from "@/games/billiards/ai";
import { BilliardsGame } from "@/games/billiards/game";
import { buildTableGeometry } from "@/games/billiards/geometry";
import { BASE_8BALL } from "@/games/billiards/modes/base8ball";
import type { Shot } from "@/games/billiards/physics";
import {
  deserializeBilliardsState,
  hashBilliardsState,
  serializeBilliardsState,
  type BilliardsState,
} from "@/games/billiards/state";
import { createNetLink, type NetLink } from "@/ui/net/link";
import { createBilliardsNet, type BilliardsNet } from "./net";
import type { PrepClock, PrepFrame } from "./prep-stream";

// Сетевой мост бильярда на парном фейк-транспорте (живой WebRTC недоступен:
// 0 ICE, §8). Проверяем реплей входящего удара, hash+shotSeq, идемпотентность и
// ресинк снимком хоста.

const G = buildTableGeometry(BASE_8BALL);

class FakeTransport implements Transport {
  state: TransportState = "open";
  peer!: FakeTransport;
  readonly sent: unknown[] = [];
  readonly #onMessage = new Set<MessageListener>();
  readonly #onState = new Set<StateListener>();

  send(message: unknown): void {
    this.sent.push(message);
    for (const listener of this.peer.#onMessage) listener(message);
  }
  onMessage(listener: MessageListener): () => void {
    this.#onMessage.add(listener);
    return () => this.#onMessage.delete(listener);
  }
  onState(listener: StateListener): () => void {
    this.#onState.add(listener);
    return () => this.#onState.delete(listener);
  }
  close(): void {
    this.state = "closed";
    for (const listener of this.#onState) listener("closed");
  }
}

function pairedTransports(): [FakeTransport, FakeTransport] {
  const host = new FakeTransport();
  const guest = new FakeTransport();
  host.peer = guest;
  guest.peer = host;
  return [host, guest];
}

interface Side {
  readonly session: Session;
  readonly game: BilliardsGame;
  readonly link: NetLink;
  net: BilliardsNet;
  readonly localId: string;
  readonly remoteId: string;
}

/** Доиграть уже запущенный реплей до покоя. */
function advanceToRest(game: BilliardsGame): void {
  let guard = 0;
  while (game.isAnimating() && guard++ < 100000) game.advance(1);
}

/** Часы с ручным временем: таймеры 5+5 проверяются без ожидания. */
class FakeClock implements PrepClock {
  time = 0;
  #next = 1;
  readonly #timers = new Map<number, { at: number; fn: () => void }>();
  now(): number {
    return this.time;
  }
  setTimeout(fn: () => void, delay: number): unknown {
    const id = this.#next++;
    this.#timers.set(id, { at: this.time + delay, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.#timers.delete(handle as number);
  }
  advance(ms: number): void {
    this.time += ms;
    let fired = true;
    while (fired) {
      fired = false;
      for (const [id, timer] of [...this.#timers]) {
        if (timer.at <= this.time) {
          this.#timers.delete(id);
          timer.fn();
          fired = true;
        }
      }
    }
  }
}

/**
 * Сторона 02-e: реплей запускает `commitShot`, но применение откладывает UI через
 * `resolveReplay`/`applyIncoming` — как в `BilliardsUi.vue`.
 */
interface ENetSide {
  readonly session: Session;
  readonly game: BilliardsGame;
  readonly link: NetLink;
  net: BilliardsNet;
  readonly localId: string;
  readonly remoteId: string;
  /** Журнал плашки ожидания: `true` — показать, `false` — снять. */
  readonly waiting: boolean[];
}

function makeENetSide(localFirst: boolean, transport: Transport, clock: PrepClock): ENetSide {
  const localId = localFirst ? "p1" : "p2";
  const remoteId = localFirst ? "p2" : "p1";
  const game = new BilliardsGame();
  const players = localFirst
    ? [
        { id: "p1", name: "Хост", agent: "human" as const, transport: "local" as const },
        { id: "p2", name: "Гость", agent: "human" as const, transport: "remote" as const },
      ]
    : [
        { id: "p1", name: "Хост", agent: "human" as const, transport: "remote" as const },
        { id: "p2", name: "Гость", agent: "human" as const, transport: "local" as const },
      ];
  const session = new Session({ game, players });
  session.start();
  game.setRoster(players);
  const link = createNetLink();
  link.configure({
    transport,
    remotePlayerId: remoteId,
    ownName: localFirst ? "Хост" : "Гость",
    ownPlayerId: localId,
  });
  const waiting: boolean[] = [];
  const side: ENetSide = {
    session,
    game,
    link,
    localId,
    remoteId,
    waiting,
    net: null as unknown as BilliardsNet,
  };
  side.net = createBilliardsNet({
    session,
    game,
    netLink: link,
    clock,
    // Реплей стартует, применение откладывается до resolveReplay.
    commitShot: (playerId) => {
      game.commitShot(playerId);
    },
    applyIncoming: (playerId, shot) => {
      if (session.makeMove(playerId, { ...shot })) side.net.afterApplied(playerId, shot);
    },
    onWaiting: (w) => waiting.push(w),
  });
  side.net.attach();
  return side;
}

function makeSide(localFirst: boolean, transport: Transport): Side {
  const localId = localFirst ? "p1" : "p2";
  const remoteId = localFirst ? "p2" : "p1";
  const game = new BilliardsGame();
  const players = localFirst
    ? [
        { id: "p1", name: "Хост", agent: "human" as const, transport: "local" as const },
        { id: "p2", name: "Гость", agent: "human" as const, transport: "remote" as const },
      ]
    : [
        { id: "p1", name: "Хост", agent: "human" as const, transport: "remote" as const },
        { id: "p2", name: "Гость", agent: "human" as const, transport: "local" as const },
      ];
  const session = new Session({ game, players });
  session.start();
  game.setRoster(players);
  const link = createNetLink();
  link.configure({
    transport,
    remotePlayerId: remoteId,
    ownName: localFirst ? "Хост" : "Гость",
    ownPlayerId: localId,
  });
  const side: Side = {
    session,
    game,
    link,
    localId,
    remoteId,
    net: null as unknown as BilliardsNet,
  };
  side.net = createBilliardsNet({
    session,
    game,
    netLink: link,
    // 02-d-путь: реплей до покоя, применение и сверка — сразу (без ожидания).
    commitShot: (playerId) => {
      // Плашка перехода (её в тесте нет) — фаза должна быть «подготовка».
      if (game.getTurnPhase() === "passing") game.acknowledgeTurn();
      const shot = game.commitShot(playerId);
      if (!shot) return;
      advanceToRest(game);
      session.makeMove(playerId, { ...shot });
      side.net.afterApplied(playerId, shot);
    },
  });
  side.net.attach();
  return side;
}

function stateOfSession(session: Session): BilliardsState {
  const state = deserializeBilliardsState(session.save().gameState);
  if (!state) throw new Error("состояние не восстановилось");
  return state;
}

function stateOf(side: Side): BilliardsState {
  return stateOfSession(side.session);
}

function hashOfSession(session: Session): number {
  return hashBilliardsState(stateOfSession(session));
}

function hashOf(side: Side): number {
  return hashOfSession(side.session);
}

/** Ход локального игрока стороны: выбор ИИ → применение → отправка. */
function playLocalShot(side: Side): Shot | null {
  const state = stateOf(side);
  if (state.finished) return null;
  const shot = chooseShot(state, G, { skill: 0.92 });
  if (!shot) return null;
  const current = side.session.snapshot().currentPlayerId;
  if (current !== side.localId) return null;
  if (!side.session.makeMove(current, { ...shot })) return null;
  side.net.afterApplied(current, shot);
  return shot;
}

describe("сетевой мост бильярда", () => {
  it("входящий удар проигрывается реплеем, а не применяется мгновенно", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    // Гость: реплей стартует, но применение отложено (проверим вручную).
    const game = new BilliardsGame();
    const session = new Session({
      game,
      players: [
        { id: "p1", name: "Хост", agent: "human", transport: "remote" },
        { id: "p2", name: "Гость", agent: "human", transport: "local" },
      ],
    });
    session.start();
    game.setRoster(session.snapshot().players);
    const link = createNetLink();
    link.configure({ transport: guestT, remotePlayerId: "p1", ownName: "Гость", ownPlayerId: "p2" });
    let pending: Shot | null = null;
    const net = createBilliardsNet({
      session,
      game,
      netLink: link,
      // Реплей стартует, применение откладывается (проверим вручную).
      commitShot: (playerId) => {
        pending = game.commitShot(playerId);
      },
    });
    net.attach();

    // Хост бьёт и отправляет.
    playLocalShot(host);
    expect(pending).not.toBeNull();
    // Реплей запущен: поле ещё не телепортировалось, очередь не сменилась.
    expect(game.isAnimating()).toBe(true);
    expect(session.snapshot().currentPlayerId).toBe("p1");

    // Доиграли реплей и применили — очередь ушла гостю.
    let guard = 0;
    while (game.isAnimating() && guard++ < 100000) game.advance(1);
    expect(session.makeMove("p1", { ...pending! })).toBe(true);
    net.afterApplied("p1", pending!);
    expect(session.snapshot().currentPlayerId).toBe("p2");
    expect(hashOfSession(session)).toBe(hashOfSession(host.session));

    host.session.destroy();
    session.destroy();
  });

  it("роли и порядок игроков совпадают (хост первым)", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    const guest = makeSide(false, guestT);
    expect(host.net.role).toBe("host");
    expect(guest.net.role).toBe("guest");

    const hostState = stateOf(host);
    const guestState = stateOf(guest);
    expect(guestState.order).toEqual(hostState.order);
    expect(guestState.mode).toBe(hostState.mode);
    expect(guestState.seed).toBe(hostState.seed);
    expect(guestState.rules).toBe(hostState.rules);
    expect(guest.session.snapshot().currentPlayerId).toBe(
      host.session.snapshot().currentPlayerId,
    );
    // Гость снимок не шлёт — источник правды только хост.
    expect(guestT.sent.some((m) => (m as { t?: string }).t === "sync")).toBe(false);

    host.session.destroy();
    guest.session.destroy();
  });

  it(
    "партия доигрывается до победителя; финальные хеши совпадают",
    { timeout: 20000 },
    () => {
      const [hostT, guestT] = pairedTransports();
      const host = makeSide(true, hostT);
      const guest = makeSide(false, guestT);

      let guard = 0;
      while (guard++ < 400 && host.session.snapshot().state === "running") {
        const current = host.session.snapshot().currentPlayerId;
        const side = current === host.localId ? host : guest;
        if (!playLocalShot(side)) break;
      }

      expect(host.session.snapshot().state).toBe("finished");
      expect(stateOf(host).finished).toBe(true);
      expect(hashOf(host)).toBe(hashOf(guest));

      host.session.destroy();
      guest.session.destroy();
    },
  );

  it("дубликат хода не меняет состояние", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    const guest = makeSide(false, guestT);

    playLocalShot(host);
    const before = hashOf(guest);
    // Повторно шлём то же сообщение: seq не растёт — мост игнорирует.
    const lastMove = hostT.sent[hostT.sent.length - 1];
    hostT.send(lastMove);
    expect(hashOf(guest)).toBe(before);
    expect(guest.game.isAnimating()).toBe(false);

    host.session.destroy();
    guest.session.destroy();
  });

  it("искусственный рассинхрон разрешается снимком хоста", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    const guest = makeSide(false, guestT);

    // Портим состояние гостя: сдвигаем шар — хеши разойдутся.
    const save = guest.session.save();
    const corrupted = deserializeBilliardsState(save.gameState)!;
    guest.session.adoptState({
      ...save,
      gameState: serializeBilliardsState({
        ...corrupted,
        balls: corrupted.balls.map((b) => (b.id === 5 ? { ...b, x: b.x + 1 } : b)),
      }),
    });
    expect(hashOf(guest)).not.toBe(hashOf(host));

    // Ход хоста: гость применяет, видит расхождение и просит снимок.
    playLocalShot(host);
    // Гость действительно попросил снимок, хост ответил `sync`.
    expect(guestT.sent).toContainEqual({ t: "resync" });
    expect(hostT.sent.some((m) => (m as { t?: string }).t === "sync")).toBe(true);
    expect(hashOf(guest)).toBe(hashOf(host));

    host.session.destroy();
    guest.session.destroy();
  });

  it("гейт ввода: локальный ввод только на ходе своего человека", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    const guest = makeSide(false, guestT);

    // Хост: сейчас его ход — ввод разрешён; гость — ввод заблокирован.
    expect(host.game.isCurrentLocal()).toBe(true);
    expect(guest.game.isCurrentLocal()).toBe(false);

    playLocalShot(host);
    // Ход перешёл удалённому гостю: у хоста ввод заблокирован, у гостя — открыт.
    expect(host.game.isCurrentLocal()).toBe(false);
    expect(guest.game.isCurrentLocal()).toBe(true);

    host.session.destroy();
    guest.session.destroy();
  });

  it("расхождение у хоста лечится его же снимком", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    const guest = makeSide(false, guestT);

    // Первый ход хоста проходит штатно — очередь у гостя.
    playLocalShot(host);

    // Портим состояние хоста (источника правды).
    const save = host.session.save();
    const corrupted = deserializeBilliardsState(save.gameState)!;
    host.session.adoptState({
      ...save,
      gameState: serializeBilliardsState({
        ...corrupted,
        balls: corrupted.balls.map((b) => (b.id === 6 ? { ...b, x: b.x + 1 } : b)),
      }),
    });

    // Гость бьёт: хост применяет и видит расхождение — шлёт свой снимок.
    playLocalShot(guest);
    expect(hostT.sent.some((m) => (m as { t?: string }).t === "sync")).toBe(true);
    expect(hashOf(guest)).toBe(hashOf(host));

    host.session.destroy();
    guest.session.destroy();
  });

  it("на ходе компьютера локальный ввод заблокирован", () => {
    const game = new BilliardsGame();
    const session = new Session({
      game,
      players: [
        { id: "p1", name: "Человек", agent: "human", transport: "local" },
        { id: "p2", name: "Компьютер", agent: "computer", transport: "local" },
      ],
    });
    session.start();
    game.setRoster(session.snapshot().players);
    expect(game.isCurrentLocal()).toBe(true);
    // Ход человека завершён — ход компьютера, ввод локального закрыт.
    session.makeMove("p1", { angle: 0, power: 0.5 });
    expect(session.snapshot().currentPlayerId).toBe("p2");
    expect(game.isCurrentLocal()).toBe(false);
    session.destroy();
  });

  it("гость принимает правила и настройки хоста при старте", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);

    // Гость стартует со своими (другими) правилами — до рукопожатия.
    const game = new BilliardsGame();
    game.applySettings({ rules: "tournament", difficulty: 3 });
    const session = new Session({
      game,
      players: [
        { id: "p1", name: "Хост", agent: "human", transport: "remote" },
        { id: "p2", name: "Гость", agent: "human", transport: "local" },
      ],
    });
    session.start();
    const link = createNetLink();
    link.configure({
      transport: guestT,
      remotePlayerId: "p1",
      ownName: "Гость",
      ownPlayerId: "p2",
    });
    const net = createBilliardsNet({ session, game, netLink: link, commitShot: () => {} });
    net.attach();

    // После sync от хоста: играет по хостовым правилам, настройки применены.
    expect(stateOfSession(session).rules).toBe("simple");
    expect((game.serializeSettings() as { rules: string }).rules).toBe("simple");

    host.session.destroy();
    session.destroy();
  });

  it("02-e: гейт ввода по локальности текущего участника", () => {
    const game = new BilliardsGame();
    const session = new Session({
      game,
      players: [
        { id: "p1", name: "Первый", agent: "human", transport: "local" },
        { id: "p2", name: "Второй", agent: "human", transport: "remote" },
      ],
    });
    session.start();
    game.setRoster(session.snapshot().players);
    // Ход локального: ввод открыт, прицел белый.
    expect(game.isCurrentLocal()).toBe(true);
    expect(session.makeMove("p1", { angle: 0, power: 0.5 })).toBe(true);
    game.acknowledgeTurn();
    // Ход удалённого: ввод закрыт, прицел бледно-оранжевый.
    expect(game.isCurrentLocal()).toBe(false);
    session.destroy();
  });

  it("02-e: prep пишет прицел, силу и биток в участника соперника", () => {
    const [hostT, guestT] = pairedTransports();
    const clock = new FakeClock();
    const host = makeENetSide(true, hostT, clock);
    const guest = makeENetSide(false, guestT, clock);

    const first: PrepFrame = { angle: 1, power: 0.2, cue: null };
    const last: PrepFrame = { angle: 2, power: 0.9, cue: { x: 3, y: 4 } };
    host.net.sendPrep(first);
    host.net.sendPrep(last);
    // Кадр записан в участника соперника (у гостя удалённый — p1).
    expect(guest.game.getParticipantAim("p1")).toBe(2);
    expect(guest.game.getParticipantPower("p1")).toBeCloseTo(0.9);
    expect(guest.game.getParticipant("p1")?.cue).toEqual({ x: 3, y: 4 });
    // Свой (локальный) участник не тронут.
    expect(guest.game.getParticipantAim("p2")).toBeNull();

    host.session.destroy();
    guest.session.destroy();
  });

  it("02-e: shot запускает реплей у обоих, приёмник держится до результата", () => {
    const [hostT, guestT] = pairedTransports();
    const clock = new FakeClock();
    const host = makeENetSide(true, hostT, clock);
    const guest = makeENetSide(false, guestT, clock);

    const shot = chooseShot(stateOfSession(host.session), G, { skill: 0.92 })!;
    // Бьющий шлёт сигнал до локального реплея.
    host.net.sendShot(shot);
    // Приёмник стартовал реплей, но ход ещё не сдвинул.
    expect(guest.game.isAnimating()).toBe(true);
    advanceToRest(guest.game);
    expect(guest.net.resolveReplay()).toBe("hold");
    expect(guest.session.snapshot().currentPlayerId).toBe(guest.remoteId);

    // Бьющий применяет удар и шлёт авторитетный результат.
    host.game.startShot(shot);
    advanceToRest(host.game);
    expect(host.session.makeMove(host.localId, { ...shot })).toBe(true);
    host.net.afterApplied(host.localId, shot);

    // Ход перешёл у обоих; хеши совпали.
    expect(host.session.snapshot().currentPlayerId).toBe("p2");
    expect(guest.session.snapshot().currentPlayerId).toBe("p2");
    expect(hashOfSession(guest.session)).toBe(hashOfSession(host.session));

    host.session.destroy();
    guest.session.destroy();
  });

  it("02-e: повторный/устаревший shot не перезапускает реплей", () => {
    const [hostT, guestT] = pairedTransports();
    const clock = new FakeClock();
    const host = makeENetSide(true, hostT, clock);
    const guest = makeENetSide(false, guestT, clock);

    const shot = chooseShot(stateOfSession(host.session), G, { skill: 0.92 })!;
    host.net.sendShot(shot);
    advanceToRest(guest.game);
    expect(guest.net.resolveReplay()).toBe("hold");

    // Повтор того же сигнала: реплей не перезапускается.
    const shotMessage = hostT.sent.find((m) => (m as { t?: string }).t === "shot")!;
    hostT.send(shotMessage);
    expect(guest.game.isAnimating()).toBe(false);

    host.session.destroy();
    guest.session.destroy();
  });

  it("02-e: нет результата 5+5 с → плашка, resync и признак обрыва", () => {
    const [hostT, guestT] = pairedTransports();
    const clock = new FakeClock();
    const host = makeENetSide(true, hostT, clock);
    const guest = makeENetSide(false, guestT, clock);

    const shot = chooseShot(stateOfSession(host.session), G, { skill: 0.92 })!;
    host.net.sendShot(shot);
    advanceToRest(guest.game);
    expect(guest.net.resolveReplay()).toBe("hold");
    // Партнёр «молчит»: на resync снимок не приходит (иначе ожидание снялось бы).
    host.link.setOutgoingState(null);
    expect(guest.waiting).toEqual([]);

    // 5 с без ответа: плашка и запрос синхронизации.
    clock.advance(5000);
    expect(guest.waiting).toEqual([true]);
    expect(guestT.sent).toContainEqual({ t: "resync" });
    expect(guest.link.peerLeft.value).toBe(false);

    // Ещё 5 с: тот же механизм, что при явном обрыве.
    clock.advance(5000);
    expect(guest.link.peerLeft.value).toBe(true);

    host.session.destroy();
    guest.session.destroy();
  });

  it("02-e: результат до таймаута снимает плашку и двигает ход", () => {
    const [hostT, guestT] = pairedTransports();
    const clock = new FakeClock();
    const host = makeENetSide(true, hostT, clock);
    const guest = makeENetSide(false, guestT, clock);

    const shot = chooseShot(stateOfSession(host.session), G, { skill: 0.92 })!;
    host.net.sendShot(shot);
    advanceToRest(guest.game);
    expect(guest.net.resolveReplay()).toBe("hold");
    // На resync снимок не приходит: плашку снимет только авторитетный результат.
    host.link.setOutgoingState(null);
    clock.advance(5000);
    expect(guest.waiting).toEqual([true]);

    host.game.startShot(shot);
    advanceToRest(host.game);
    host.session.makeMove(host.localId, { ...shot });
    host.net.afterApplied(host.localId, shot);

    // Плашка снята, таймеры не текут, ход перешёл.
    expect(guest.waiting).toEqual([true, false]);
    expect(guest.session.snapshot().currentPlayerId).toBe("p2");
    clock.advance(20000);
    expect(guest.link.peerLeft.value).toBe(false);

    host.session.destroy();
    guest.session.destroy();
  });

  it("02-e: 02-d-путь без парного shot работает как раньше (фолбэк)", () => {
    const [hostT, guestT] = pairedTransports();
    const host = makeSide(true, hostT);
    const guest = makeSide(false, guestT);
    playLocalShot(host);
    expect(hashOf(guest)).toBe(hashOf(host));
    host.session.destroy();
    guest.session.destroy();
  });
});
