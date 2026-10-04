<script setup lang="ts">
// UI крестиков-ноликов: баннер хода/результата и передача выбранной клетки в
// сессию. Рисует фигуры сама игра (`Game.draw`), поэтому здесь только текст и
// подписка на выбор клетки из слоя поля.
import { computed, inject, onScopeDispose, ref, watch } from "vue";
import type { SessionSnapshot } from "@/core/session";
import type { Point } from "@/core/viewport";
import { boardInputKey, type BoardPickHandler } from "@/ui/board-input";
import { dialogKey } from "@/ui/dialog/key";
import { MainScreen } from "@/ui/screens";
import { sessionHostKey } from "@/ui/session-host";
import ResultDialog from "./ResultDialog.vue";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedInput = inject(boardInputKey);
if (!injectedInput) throw new Error("Ввод поля не предоставлен");
const boardInput = injectedInput;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

const snapshot = ref<SessionSnapshot | null>(null);
let unsubscribe: (() => void) | null = null;

watch(
  () => sessionHost.session.value,
  (session) => {
    unsubscribe?.();
    unsubscribe = null;
    snapshot.value = session?.snapshot() ?? null;
    if (session) unsubscribe = session.subscribe((next) => (snapshot.value = next));
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
  session.makeMove(current.id, { x: cell.x, y: cell.y });
};

boardInput.handler.value = onPick;
boardInput.cursor.value = "default";
onScopeDispose(() => {
  unsubscribe?.();
  if (boardInput.handler.value === onPick) boardInput.handler.value = null;
  boardInput.cursor.value = "default";
});

// Партия завершилась — показываем итог с «Реванш»/«Выйти».
function openResult(): void {
  const snap = snapshot.value;
  if (!snap) return;
  const winner = snap.winnerId
    ? (snap.players.find((player) => player.id === snap.winnerId)?.name ?? null)
    : null;
  dialog.show({
    component: ResultDialog,
    title: "Партия окончена",
    props: {
      message: winner ? `Победил ${winner}` : "Ничья",
      onResolve: (value: string) => {
        dialog.close();
        if (value === "rematch") {
          sessionHost.session.value?.restart();
          return;
        }
        sessionHost.clear();
        dialog.show({ component: MainScreen, title: "Меню" });
      },
    },
  });
}

watch(snapshot, (next, previous) => {
  if (next?.state === "finished" && previous?.state !== "finished") openResult();
});

const currentName = computed(() => {
  const snap = snapshot.value;
  if (!snap || !snap.currentPlayerId) return null;
  return snap.players.find((player) => player.id === snap.currentPlayerId)?.name ?? null;
});

const winnerName = computed(() => {
  const snap = snapshot.value;
  if (!snap || !snap.winnerId) return null;
  return snap.players.find((player) => player.id === snap.winnerId)?.name ?? null;
});

const status = computed(() => {
  const snap = snapshot.value;
  if (!snap) return "";
  if (snap.state === "finished") {
    return winnerName.value ? `Победил ${winnerName.value}` : "Ничья";
  }
  return currentName.value ? `Ходит ${currentName.value}` : "Ход";
});
</script>

<template>
  <p
    v-if="snapshot"
    class="game-banner"
    :class="{ 'game-banner--done': snapshot.state === 'finished' }"
  >
    {{ status }}
  </p>
</template>

<style scoped>
.game-banner {
  position: absolute;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in oklch, var(--surface-2) 88%, transparent);
  box-shadow: var(--elev-2);
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.game-banner--done {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
