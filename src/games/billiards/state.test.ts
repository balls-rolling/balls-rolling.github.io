import { describe, expect, it } from "vitest";
import { DEFAULT_SEED } from "./constants";
import { BASE_8BALL } from "./modes/base8ball";
import {
  createInitialState,
  deserializeBilliardsState,
  hashBilliardsState,
  serializeBilliardsState,
} from "./state";

describe("состояние бильярда", () => {
  it("16 шаров, ids 0–15, режим и состав игроков сохранены", () => {
    const state = createInitialState(BASE_8BALL, ["p1", "p2"]);
    expect(state.balls).toHaveLength(16);
    expect(state.balls.map((b) => b.id)).toEqual([...Array(16).keys()]);
    expect(state.order).toEqual(["p1", "p2"]);
    expect(state.mode).toBe("8ball");
    expect(state.version).toBe(2);
    expect(state.finished).toBe(false);
  });

  it("раскладка детерминирована", () => {
    expect(createInitialState(BASE_8BALL, ["p1"], 11).balls).toEqual(
      createInitialState(BASE_8BALL, ["p1"], 11).balls,
    );
  });

  it("round-trip через JSON без потерь", () => {
    const state = createInitialState(BASE_8BALL, ["p1", "p2"], DEFAULT_SEED);
    const json = JSON.parse(JSON.stringify(serializeBilliardsState(state)));
    expect(deserializeBilliardsState(json)).toEqual(state);
  });

  it("валидатор отбрасывает мусор", () => {
    expect(deserializeBilliardsState(null)).toBeNull();
    expect(deserializeBilliardsState({})).toBeNull();
    // Формат версии 1 не поддерживается (см. комментарий в state.ts).
    expect(deserializeBilliardsState({ version: 1 })).toBeNull();
    expect(deserializeBilliardsState({ version: 3 })).toBeNull();
    const broken = JSON.parse(
      JSON.stringify(serializeBilliardsState(createInitialState(BASE_8BALL, ["p1"]))),
    );
    broken.balls = broken.balls.slice(0, 15);
    expect(deserializeBilliardsState(broken)).toBeNull();
  });

  it("валидатор отвергает неизвестный режим", () => {
    const base = JSON.parse(
      JSON.stringify(serializeBilliardsState(createInitialState(BASE_8BALL, ["p1"]))),
    );
    base.mode = "russian";
    expect(deserializeBilliardsState(base)).toBeNull();
  });

  it("валидатор отвергает не-числа, переставленные id и битый спин", () => {
    const base = JSON.parse(
      JSON.stringify(serializeBilliardsState(createInitialState(BASE_8BALL, ["p1"]))),
    );

    const nonFinite = structuredClone(base);
    nonFinite.balls[2].x = Infinity;
    expect(deserializeBilliardsState(nonFinite)).toBeNull();

    const swapped = structuredClone(base);
    [swapped.balls[1], swapped.balls[2]] = [swapped.balls[2], swapped.balls[1]];
    expect(deserializeBilliardsState(swapped)).toBeNull();

    const brokenSpin = structuredClone(base);
    brokenSpin.balls[3].spin.x = "nope";
    expect(deserializeBilliardsState(brokenSpin)).toBeNull();
  });

  it("новое состояние 8-ball стартует с дефолтами (стол открыт, simple)", () => {
    const state = createInitialState(BASE_8BALL, ["p1", "p2"]);
    expect(state.groups).toBeNull();
    expect(state.rules).toBe("simple");
    expect(state.phase).toBe("open");
    expect(state.winner).toBeNull();
    expect(state.finishReason).toBeNull();
    expect(state.ballInHand).toBe(false);
    expect(state.shotSeq).toBe(0);
  });

  it("round-trip сохраняет новые поля 8-ball", () => {
    const base = createInitialState(BASE_8BALL, ["p1", "p2"], DEFAULT_SEED, {
      rules: "tournament",
    });
    const state = {
      ...base,
      groups: { p1: "solid", p2: "stripe" } as const,
      phase: "assigned" as const,
      ballInHand: true,
      shotSeq: 3,
    };
    const json = JSON.parse(JSON.stringify(serializeBilliardsState(state)));
    expect(json.groups).toEqual({ p1: "solid", p2: "stripe" });
    expect(json.rules).toBe("tournament");
    expect(json.phase).toBe("assigned");
    expect(json.ballInHand).toBe(true);
    expect(json.shotSeq).toBe(3);
    expect(deserializeBilliardsState(json)).toEqual(state);
  });

  it("round-trip сохраняет финиш с победителем и причиной", () => {
    const base = createInitialState(BASE_8BALL, ["p1", "p2"], DEFAULT_SEED);
    const state = {
      ...base,
      finished: true,
      groups: { p1: "solid", p2: "stripe" } as const,
      phase: "finished" as const,
      winner: "p1",
      finishReason: "eightBall" as const,
      shotSeq: 12,
    };
    const json = JSON.parse(JSON.stringify(serializeBilliardsState(state)));
    expect(deserializeBilliardsState(json)).toEqual(state);
  });

  it("старая запись version: 2 без новых полей читается с дефолтами", () => {
    const full = JSON.parse(
      JSON.stringify(serializeBilliardsState(createInitialState(BASE_8BALL, ["p1", "p2"]))),
    );
    for (const key of ["groups", "rules", "phase", "winner", "finishReason", "ballInHand", "shotSeq"]) {
      delete full[key];
    }
    const restored = deserializeBilliardsState(full);
    expect(restored).not.toBeNull();
    expect(restored).toMatchObject({
      groups: null,
      rules: "simple",
      phase: "open",
      winner: null,
      finishReason: null,
      ballInHand: false,
      shotSeq: 0,
    });
  });

  it("валидатор отвергает битые новые поля", () => {
    const base = () =>
      JSON.parse(JSON.stringify(serializeBilliardsState(createInitialState(BASE_8BALL, ["p1"]))));

    const badRules = base();
    badRules.rules = "arcade";
    expect(deserializeBilliardsState(badRules)).toBeNull();

    const badGroups = base();
    badGroups.groups = { p1: "dots" };
    expect(deserializeBilliardsState(badGroups)).toBeNull();

    const badPhase = base();
    badPhase.phase = "half-time";
    expect(deserializeBilliardsState(badPhase)).toBeNull();

    const badSeq = base();
    badSeq.shotSeq = -1;
    expect(deserializeBilliardsState(badSeq)).toBeNull();

    const badHand = base();
    badHand.ballInHand = "yes";
    expect(deserializeBilliardsState(badHand)).toBeNull();
  });

  it("хэш состояния: одинаковый вход — одинаковый хэш, разный — разный", () => {
    const a = createInitialState(BASE_8BALL, ["p1", "p2"]);
    const b = createInitialState(BASE_8BALL, ["p1", "p2"]);
    expect(hashBilliardsState(a)).toBe(hashBilliardsState(b));
    expect(Number.isInteger(hashBilliardsState(a))).toBe(true);

    // Сдвиг одного шара меняет хэш.
    const moved = {
      ...a,
      balls: a.balls.map((ball) => (ball.id === 5 ? { ...ball, x: ball.x + 1 } : ball)),
    };
    expect(hashBilliardsState(moved)).not.toBe(hashBilliardsState(a));

    // Смена статуса партии меняет хэш.
    expect(hashBilliardsState({ ...a, turn: 1 })).not.toBe(hashBilliardsState(a));
    expect(hashBilliardsState({ ...a, phase: "assigned" })).not.toBe(hashBilliardsState(a));
    expect(hashBilliardsState({ ...a, shotSeq: 1 })).not.toBe(hashBilliardsState(a));
  });

  it("хэш не зависит от порядка ключей групп", () => {
    const base = createInitialState(BASE_8BALL, ["p1", "p2"]);
    const one = hashBilliardsState({ ...base, groups: { p1: "solid", p2: "stripe" } });
    const two = hashBilliardsState({ ...base, groups: { p2: "stripe", p1: "solid" } });
    expect(one).toBe(two);
  });
});
