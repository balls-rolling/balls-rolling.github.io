import { describe, expect, it } from "vitest";
import { buildTableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import { AimPreviewController } from "./preview";
import type { BallState, BilliardsState } from "./state";

const G = buildTableGeometry(BASE_8BALL);

function stateWithCue(): BilliardsState {
  const balls: BallState[] = [
    {
      id: 0,
      x: 600,
      y: 635,
      vx: 0,
      vy: 0,
      spin: { x: 0, y: 0, z: 0 },
      active: true,
    },
  ];
  return {
    version: 2,
    mode: "8ball",
    seed: 1,
    order: ["p1"],
    turn: 0,
    balls,
    finished: false,
    groups: null,
    rules: "simple",
    phase: "open",
    winner: null,
    finishReason: null,
    ballInHand: false,
    shotSeq: 0,
    turnReason: "initial",
    prep: { canPlaceCue: true, canChooseCueBall: false },
  };
}

describe("AimPreviewController", () => {
  it("полная траектория сразу в первом кадре, без ожидания тишины", () => {
    const controller = new AimPreviewController();
    const frame = controller.frame(stateWithCue(), 0, 1, G);
    expect(frame.current).not.toBeNull();
    expect(frame.current!.complete).toBe(true);
    expect(frame.current!.path.length).toBeGreaterThan(1);
    expect(controller.hasPending()).toBe(false);
  });

  it("смена входа сразу даёт полную траекторию нужного направления", () => {
    const controller = new AimPreviewController();
    const state = stateWithCue();
    const first = controller.frame(state, 0, 1, G).current!;
    controller.invalidate();
    const frame = controller.frame(state, 0.4, 0.7, G);
    expect(frame.current!.complete).toBe(true);
    expect(frame.current).not.toBe(first);
    const live = frame.current!;
    expect(
      Math.atan2(live.path[1]!.y - live.path[0]!.y, live.path[1]!.x - live.path[0]!.x),
    ).toBeCloseTo(0.4, 2);
  });

  it("новое поколение не продолжает прошлое при смене угла", () => {
    const controller = new AimPreviewController();
    const state = stateWithCue();
    controller.frame(state, 0.1, 1, G);
    const frame = controller.frame(state, 1.2, 1, G);
    const dir = frame.current!;
    expect(dir.complete).toBe(true);
    expect(
      Math.atan2(dir.path[1]!.y - dir.path[0]!.y, dir.path[1]!.x - dir.path[0]!.x),
    ).toBeCloseTo(1.2, 2);
  });

  it("не сохраняет прогноз для другого снимка состояния партии", () => {
    const controller = new AimPreviewController();
    controller.frame(stateWithCue(), 0, 1, G);
    const frame = controller.frame(stateWithCue(), 0.2, 0.8, G);
    expect(frame.previous).toBeNull();
    expect(frame.current!.complete).toBe(true);
  });
});
