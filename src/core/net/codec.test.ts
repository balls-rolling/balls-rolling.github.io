import { describe, expect, it } from "vitest";
import {
  BadCodeError,
  decodeBase64Url,
  decodeInvite,
  encodeBase64Url,
  encodeInvite,
  type Invite,
} from "./codec";

const SDP =
  "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" +
  "a=ice-ufrag:abcdefgh\r\na=ice-pwd:0123456789abcdef0123456789\r\n" +
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\n";
const GAMES = ["tic-tac-toe"];
const VERSION = 1;

function hostInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    v: VERSION,
    game: "tic-tac-toe",
    role: "host",
    name: "Игрок",
    sdp: { type: "offer", sdp: SDP },
    ...overrides,
  };
}

function decodeHost(code: string) {
  return decodeInvite(code, { games: GAMES, version: VERSION, expectedRole: "host" });
}

describe("кодек приглашения", () => {
  it("base64url переживает кириллицу и юникод", () => {
    const text = "Привет, мир! 🎲 — sdp";
    expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
    expect(encodeBase64Url(text)).not.toMatch(/[+/=]/);
  });

  it("roundtrip: хост и ответ гостя", async () => {
    const invite = hostInvite();
    expect(await decodeHost(await encodeInvite(invite))).toEqual(invite);

    const answer = hostInvite({ role: "guest", name: "Гость", sdp: { type: "answer", sdp: SDP } });
    expect(
      await decodeInvite(await encodeInvite(answer), {
        games: GAMES,
        version: VERSION,
        expectedRole: "guest",
      }),
    ).toEqual(answer);
  });

  it("roundtrip: опциональные поля восстановления", async () => {
    const invite = hostInvite({
      restore: true,
      playerId: "p1",
      sessionId: "game-123",
    });
    expect(await decodeHost(await encodeInvite(invite))).toEqual(invite);
  });

  it("отсутствующие поля не появляются в результате", async () => {
    const invite = hostInvite();
    const decoded = await decodeHost(await encodeInvite(invite));
    expect(decoded).toEqual(invite);
    expect(Object.keys(decoded).sort()).toEqual(Object.keys(invite).sort());
    expect("restore" in decoded).toBe(false);
    expect("playerId" in decoded).toBe(false);
    expect("sessionId" in decoded).toBe(false);
  });

  it("пустые опциональные строки не добавляют ключи", async () => {
    const invite = hostInvite({ restore: false, playerId: "   ", sessionId: "" });
    const decoded = await decodeHost(await encodeInvite(invite));
    expect(decoded.restore).toBe(false);
    expect("playerId" in decoded).toBe(false);
    expect("sessionId" in decoded).toBe(false);
  });

  it("мусорные типы опциональных полей → BadCodeError", async () => {
    await expect(
      decodeHost(await encodeInvite(hostInvite({ restore: "yes" as unknown as boolean }))),
    ).rejects.toThrow(BadCodeError);
    await expect(
      decodeHost(await encodeInvite(hostInvite({ playerId: 5 as unknown as string }))),
    ).rejects.toThrow(BadCodeError);
    await expect(
      decodeHost(await encodeInvite(hostInvite({ sessionId: {} as unknown as string }))),
    ).rejects.toThrow(BadCodeError);
  });

  it("код сжимается и выходит короче сырого", async () => {
    const invite = hostInvite();
    const code = await encodeInvite(invite);
    expect(code.startsWith("z")).toBe(true);
    const raw = `u${encodeBase64Url(JSON.stringify(invite))}`;
    expect(code.length).toBeLessThan(raw.length);
  });

  it("отвергает мусор и не-json", async () => {
    await expect(decodeHost("совсем не код!")).rejects.toThrow(BadCodeError);
    await expect(decodeHost("z" + encodeBase64Url("не json"))).rejects.toThrow(BadCodeError);
    await expect(decodeHost("u" + encodeBase64Url("не json"))).rejects.toThrow(BadCodeError);
    await expect(decodeHost("")).rejects.toThrow(BadCodeError);
  });

  it("отвергает чужой протокол, игру, роль и SDP", async () => {
    await expect(decodeHost(await encodeInvite(hostInvite({ v: 2 })))).rejects.toThrow(
      BadCodeError,
    );
    await expect(decodeHost(await encodeInvite(hostInvite({ game: "other" })))).rejects.toThrow(
      BadCodeError,
    );
    await expect(
      decodeInvite(await encodeInvite(hostInvite()), {
        games: GAMES,
        version: VERSION,
        expectedRole: "guest",
      }),
    ).rejects.toThrow(BadCodeError);
    await expect(
      decodeHost(
        await encodeInvite(hostInvite({ sdp: { type: "offer", sdp: "мусор" } as Invite["sdp"] })),
      ),
    ).rejects.toThrow(BadCodeError);
    await expect(
      decodeHost(
        await encodeInvite(
          hostInvite({ sdp: { type: "bogus", sdp: SDP } as unknown as Invite["sdp"] }),
        ),
      ),
    ).rejects.toThrow(BadCodeError);
    await expect(decodeHost(await encodeInvite(hostInvite({ name: "   " })))).rejects.toThrow(
      BadCodeError,
    );
  });
});
