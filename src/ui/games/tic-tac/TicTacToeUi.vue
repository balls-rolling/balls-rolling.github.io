<script setup lang="ts">
// UI крестиков-ноликов: подписка на выбор клетки из слоя поля и подключение
// сетевого моста. Рисует фигуры сама игра (`Game.draw`), итог партии показывает
// платформа (окно через инструмент `dialogs` игры), поэтому у игры своего экрана результата нет.
import { inject, onScopeDispose, ref, watch } from "vue";
import type { SessionSnapshot } from "@/core/session";
import type { Point } from "@/core/viewport";
import { boardInputKey, type BoardPickHandler } from "@/ui/board-input";
import { netLinkKey } from "@/ui/net";
import { sessionHostKey } from "@/ui/session-host";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedInput = inject(boardInputKey);
if (!injectedInput) throw new Error("Ввод поля не предоставлен");
const boardInput = injectedInput;

const injectedNet = inject(netLinkKey);
if (!injectedNet) throw new Error("Сетевой мост не предоставлен");
const netLink = injectedNet;

const snapshot = ref<SessionSnapshot | null>(null);
let unsubscribe: (() => void) | null = null;

watch(
  () => sessionHost.session.value,
  (session) => {
    unsubscribe?.();
    unsubscribe = null;
    snapshot.value = session?.snapshot() ?? null;
    if (session) {
      unsubscribe = session.subscribe((next) => (snapshot.value = next));
      // Сетевая партия: подключаем мост к сессии (для локальных — транспорта нет).
      if (netLink.transport.value) netLink.attach(session);
    }
  },
  { immediate: true },
);

// Клик по полю: ход делает человек, чей сейчас ход. Компьютер и сеть — не здесь.
const onPick: BoardPickHandler = (cell: Point) => {
  const session = sessionHost.session.value;
  if (!session) return;
  const snap = session.snapshot();
  if (snap.state !== "running") return;
  const current = snap.players.find((player) => player.id === snap.currentPlayerId);
  if (!current || current.agent !== "human" || current.transport !== "local") return;
  if (session.makeMove(current.id, { x: cell.x, y: cell.y })) {
    netLink.sendMove({ x: cell.x, y: cell.y });
  }
};

boardInput.handler.value = onPick;
boardInput.cursor.value = "default";

onScopeDispose(() => {
  unsubscribe?.();
  if (boardInput.handler.value === onPick) boardInput.handler.value = null;
  boardInput.cursor.value = "default";
  netLink.detach();
});
</script>

<!-- Шаблон пустой намеренно: у крестиков нет UI игры — поле рисует игра, панель
     игроков и итог партии показывает платформа. -->
<template />
