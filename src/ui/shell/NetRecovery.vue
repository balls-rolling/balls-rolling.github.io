<script setup lang="ts">
// Реакция на обрыв сетевой партии (12-b, D12/D13). Живёт в игровом слое: в демо
// не монтируется. Наблюдает за состоянием транспорта сетевой сессии и показывает
// диалог: хосту — «Восстановить»/«Покинуть», гостю — «Покинуть игру».
import { inject, markRaw, ref, watch } from "vue";
import type { Game } from "@/core/game";
import type { Session } from "@/core/session";
import { createLobby } from "@/ui/lobby";
import { dialogKey } from "@/ui/dialog/key";
import { isDisconnected, networkRole } from "@/ui/net-recovery";
import { netLinkKey } from "@/ui/net";
import { notificationsKey } from "@/ui/notifications";
import { platformKey } from "@/ui/platform";
import { recoverNetworkHost } from "@/ui/resume-net-game";
import { MainScreen } from "@/ui/screens";
import { sessionHostKey } from "@/ui/session-host";
import NetDropDialog from "./NetDropDialog.vue";

const platform = inject(platformKey);
if (!platform) throw new Error("Платформа не предоставлена");
const dialog = inject(dialogKey);
if (!dialog) throw new Error("Менеджер диалогов не предоставлен");
const sessionHost = inject(sessionHostKey);
if (!sessionHost) throw new Error("Слот сессии не предоставлен");
const netLink = inject(netLinkKey);
if (!netLink) throw new Error("Сетевой мост не предоставлен");
const notifications = inject(notificationsKey);
if (!notifications) throw new Error("Центр уведомлений не предоставлен");

/** Диалог обрыва уже показан — не дублируем, пока не завершим. */
const shown = ref(false);

function leaveToMenu(): void {
  shown.value = false;
  sessionHost?.clear();
  dialog?.close();
  dialog?.show({ component: MainScreen, title: "Меню" });
}

async function recover(session: Session, game: Game): Promise<void> {
  const lobby = createLobby({
    platform: platform!,
    dialog: dialog!,
    netLink: netLink!,
    notifications: notifications!,
    gameId: game.id,
  });
  const ok = await recoverNetworkHost(game, session, {
    platform: platform!,
    sessionHost: sessionHost!,
    dialog: dialog!,
    netLink: netLink!,
    restoreLobby: lobby,
  });
  // Отмена лобби — диалог обрыва остаётся под ним; ничего не делаем.
  if (ok) shown.value = false;
}

watch(
  [() => netLink.status.value, () => netLink.peerLeft.value, () => sessionHost.session.value],
  () => {
    if (shown.value) return;
    const session = sessionHost.session.value;
    const game = sessionHost.game.value;
    if (!session || !game || session.isDemo) return;
    // Диалог обрыва — только у идущей партии: завершённую (экран результата) не
    // накрываем, её «разрыв» — это нормальный выход после финала.
    if (session.snapshot().state !== "running") return;
    const role = networkRole(session);
    if (!role) return;
    if (!isDisconnected(netLink.status.value, netLink.peerLeft.value)) return;

    shown.value = true;
    dialog.show({
      component: markRaw(NetDropDialog),
      title: role === "host" ? "Соперник отключился" : "Соединение потеряно",
      props: {
        role,
        onRecover: role === "host" ? () => void recover(session, game) : undefined,
        onLeave: leaveToMenu,
      },
      handle: { destroy: () => (shown.value = false) },
    });
  },
  { immediate: true },
);
</script>

<template>
  <!-- Компонент без разметки: только наблюдение и диалог. -->
</template>
