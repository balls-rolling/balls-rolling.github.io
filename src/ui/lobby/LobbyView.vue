<script setup lang="ts">
// Экран лобби: приглашение (ссылка/QR), состав с выгоном, «Начать» у хоста;
// лобби ожидания у гостя с ответным QR и выходом. Состояние и логика — в
// оркестраторе (`net.ts`/`session.ts`); здесь только отображение и события.
import { computed, inject, markRaw, ref } from "vue";
import { dialogKey } from "@/ui/dialog/key";
import { iconFor } from "@/ui/icons";
import { QrDialog, QrScanner } from "@/ui/net";
import type { LobbyViewCallbacks, LobbyViewState } from "./types";

const props = defineProps<{ state: LobbyViewState } & LobbyViewCallbacks>();

const injected = inject(dialogKey);
if (!injected) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injected;

// Иконка QR, если есть; иначе кнопка остаётся текстом.
const qrIcon = iconFor("qr");

const canStart = computed(() =>
  props.state.restore ? props.state.canStart === true : props.state.players.length >= 2,
);
// Хост — первый в составе; подписи и «Выгнать» привязаны к нему, а не к строке `p1`.
const hostId = computed(() => props.state.players[0]?.id);
const answerText = ref("");
const inviteText = ref("");
const copied = ref(false);
let copiedTimer: number | null = null;

function copy(text: string): void {
  void navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    if (copiedTimer !== null) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => (copied.value = false), 1500);
  });
}

function showQr(value: string, label: string): void {
  dialog.show({
    component: markRaw(QrDialog),
    title: label,
    wide: true,
    props: { value, label },
  });
}

function submitAnswer(): void {
  if (!answerText.value || props.state.busy) return;
  props.onAnswer?.(answerText.value);
}

function submitJoin(): void {
  if (!inviteText.value || props.state.busy) return;
  props.onJoin?.(inviteText.value);
}

function onScanned(text: string): void {
  // Отсканированный QR — готовый код (ссылка приглашения или ответный код).
  if (props.state.role === "guest" && props.onJoin) {
    inviteText.value = text;
    props.onJoin(text);
  } else if (props.onAnswer) {
    answerText.value = text;
    props.onAnswer(text);
  }
}
</script>

<template>
  <div class="group">
    <div v-if="state.preparing" class="loading">
      <span class="spinner" aria-hidden="true" />
      <span>{{ state.role === "host" ? "Готовим приглашение…" : "Подключаемся…" }}</span>
    </div>

    <!-- Восстановление партии (12-b): короткое пояснение поверх обычного экрана. -->
    <p v-if="state.restore && !state.preparing" class="lobby-hint">
      Восстановление партии. Ждём прежних игроков.
    </p>

    <!-- Хост -->
    <template v-if="state.role === 'host' && !state.preparing">
      <label class="field">
        <span class="field__label">Ссылка-приглашение</span>
        <textarea class="lobby-code" readonly :value="state.inviteLink" rows="3" />
      </label>
      <div class="group group--horizontal">
        <button
          class="btn btn--secondary btn--sm btn--flex"
          type="button"
          @click="copy(state.inviteLink)"
        >
          <span class="btn__label">{{ copied ? "Скопировано" : "Скопировать" }}</span>
        </button>
        <button
          class="btn btn--secondary btn--sm btn--auto"
          type="button"
          aria-label="Показать QR"
          title="Показать QR"
          @click="showQr(state.inviteLink, 'QR приглашения')"
        >
          <component :is="qrIcon" v-if="qrIcon" class="icon" aria-hidden="true" />
          <span v-else class="btn__label">QR</span>
        </button>
      </div>
      <label class="field">
        <span class="field__label">Ответный код соперника (или отсканируйте QR)</span>
        <textarea v-model="answerText" class="lobby-code" rows="3" :disabled="state.busy" />
      </label>
      <div class="group group--horizontal">
        <button
          class="btn btn--primary btn--flex"
          type="button"
          :disabled="!answerText || state.busy"
          @click="submitAnswer"
        >
          <span v-if="state.busy" class="spinner" aria-hidden="true" />
          <span class="btn__label">{{
            state.restore ? "Подключить соперника" : "Подключить"
          }}</span>
        </button>
        <QrScanner v-if="onScan" :on-scan="onScanned" />
      </div>
    </template>

    <!-- Гость: ввод приглашения -->
    <template v-if="state.role === 'guest' && !state.joined && !state.preparing">
      <label class="field">
        <span class="field__label">Код приглашения (или отсканируйте QR)</span>
        <textarea v-model="inviteText" class="lobby-code" rows="3" :disabled="state.busy" />
      </label>
      <div class="group group--horizontal">
        <button
          class="btn btn--primary"
          type="button"
          :disabled="!inviteText || state.busy"
          @click="submitJoin"
        >
          <span v-if="state.busy" class="spinner" aria-hidden="true" />
          <span class="btn__label">Подключиться</span>
        </button>
        <QrScanner v-if="onScan" :on-scan="onScanned" />
      </div>
    </template>

    <!-- Гость: лобби ожидания -->
    <template v-if="state.role === 'guest' && state.joined">
      <p v-if="state.restore" class="lobby-hint">{{ state.waiting ?? "Ожидание хоста" }}</p>
      <label class="field">
        <span class="field__label">Ответный код — передайте хосту</span>
        <textarea class="lobby-code" readonly :value="state.answerCode" rows="3" />
      </label>
      <div class="group group--horizontal">
        <button
          class="btn btn--secondary btn--sm btn--flex"
          type="button"
          @click="copy(state.answerCode)"
        >
          <span class="btn__label">{{ copied ? "Скопировано" : "Скопировать" }}</span>
        </button>
        <button
          class="btn btn--secondary btn--sm btn--auto"
          type="button"
          aria-label="Показать QR"
          title="Показать QR"
          @click="showQr(state.answerCode, 'QR ответа')"
        >
          <component :is="qrIcon" v-if="qrIcon" class="icon" aria-hidden="true" />
          <span v-else class="btn__label">QR</span>
        </button>
      </div>
    </template>

    <p v-if="state.error" class="lobby-error">{{ state.error }}</p>

    <template v-if="state.joined || state.role === 'host'">
      <span class="field__label">Игроки ({{ state.players.length }})</span>
      <ul class="lobby-players list-reset">
        <li v-for="player in state.players" :key="player.id">
          <span>{{ player.name }}</span>
          <span class="text-muted">{{ player.id === hostId ? "хост" : "гость" }}</span>
          <button
            v-if="state.role === 'host' && player.id !== hostId && !state.restore && onKick"
            class="btn btn--ghost btn--sm"
            type="button"
            title="Выгнать"
            @click="onKick?.(player.id)"
          >
            <span class="btn__label">Выгнать</span>
          </button>
        </li>
      </ul>
    </template>

    <div class="group group--horizontal">
      <button
        v-if="state.role === 'host'"
        class="btn btn--primary"
        type="button"
        :disabled="!canStart || state.busy"
        @click="onStart?.()"
      >
        <span class="btn__label">Начать</span>
      </button>
      <button
        v-if="state.role === 'guest' && state.joined"
        class="btn btn--secondary"
        type="button"
        @click="onLeave?.()"
      >
        <span class="btn__label">Выйти из лобби</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.lobby-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--fs-sm);
  resize: vertical;
  word-break: break-all;
}

.lobby-players {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.lobby-players li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.lobby-players button {
  margin-left: auto;
}

.lobby-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--fs-sm);
}

.lobby-hint {
  margin: 0;
  color: var(--on-surface-variant);
  font-size: var(--fs-sm);
}
</style>
