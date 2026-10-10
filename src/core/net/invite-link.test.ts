import { describe, expect, it } from "vitest";
import {
  NET_GAME_OPEN,
  buildInviteLink,
  inviteOfferFromInput,
  parseInviteLink,
} from "./invite-link";

const OFFER = "eyJ2IjoxLCJnYW1lIjoidGljLXRhYy10b2UifQ";

describe("ссылка-приглашение", () => {
  it("собирается и разбирается обратно", () => {
    const link = buildInviteLink(
      { gameId: "tic-tac-toe", offer: OFFER },
      "https://example.com/app",
    );
    const url = new URL(link);
    expect(url.searchParams.get("open")).toBe(NET_GAME_OPEN);
    expect(parseInviteLink(link)).toEqual({ gameId: "tic-tac-toe", offer: OFFER });
  });

  it("кириллица и символы в offer переживают roundtrip", () => {
    const offer = "пробел + слэш/равно= кириллица";
    const link = buildInviteLink({ gameId: "игра", offer }, "https://example.com/");
    expect(parseInviteLink(link)).toEqual({ gameId: "игра", offer });
  });

  it("чужая или неполная ссылка — null", () => {
    expect(parseInviteLink("https://example.com/?other=1")).toBeNull();
    expect(parseInviteLink("https://example.com/?open=net_game&game_id=x")).toBeNull();
    expect(parseInviteLink("https://example.com/?open=net_game&offer=x")).toBeNull();
    expect(parseInviteLink("не url")).toBeNull();
  });

  it("сохраняет существующие query-параметры базы", () => {
    const link = buildInviteLink({ gameId: "g", offer: "o" }, "https://example.com/?theme=dark");
    expect(new URL(link).searchParams.get("theme")).toBe("dark");
    expect(parseInviteLink(link)).toEqual({ gameId: "g", offer: "o" });
  });

  it("ввод принимает и ссылку, и сам код", () => {
    const link = buildInviteLink(
      { gameId: "tic-tac-toe", offer: OFFER },
      "https://example.com/app",
    );
    expect(inviteOfferFromInput(link)).toBe(OFFER);
    expect(inviteOfferFromInput(OFFER)).toBe(OFFER);
    expect(inviteOfferFromInput("произвольный текст")).toBe("произвольный текст");
  });
});
