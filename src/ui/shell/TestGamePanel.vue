<script setup lang="ts">
// Панель тестовой игры: дёргает сессию и показывает, что происходит.
// Временная по назначению и заменяет собой отладочный HUD (решение D10).
// Подписка на сессию — через shallowRef и замену ссылки: ядро о Vue не знает.
import { inject, onMounted, onScopeDispose, ref, shallowRef } from "vue";
import type { Session, SessionSnapshot } from "@/core/session";
import { platformKey } from "@/ui/platform";

const injected = inject(platformKey);
if (!injected) throw new Error("Платформа не предоставлена");
// Отдельная константа: сужение типа не сохраняется внутри замыканий ниже.
const platform = injected;

const session = shallowRef<Session | null>(null);
const snapshot = shallowRef<SessionSnapshot | null>(null);
const log = ref<string[]>([]);
const playerName = ref("Игрок");
const error = ref("");

function append(text: string): void {
  // Держим последние события, а не бесконечную ленту.
  log.value = [...log.value, text].slice(-40);
}

async function startSession(): Promise<void> {
  error.value = "";
  const entry = platform.listGames()[0];
  if (!entry) {
    error.value = "В реестре нет ни одной игры";
    return;
  }

  session.value?.destroy();

  const created = await platform.createSession(entry, [
    { id: "p1", name: playerName.value, agent: "human", transport: "local" },
    { id: "p2", name: "Гость", agent: "human", transport: "local" },
  ]);

  snapshot.value = created.snapshot();
  const off = created.subscribe((next) => {
    snapshot.value = next;
    append(`revision ${next.revision}: ${next.state}`);
  });
  onScopeDispose(off);

  session.value = created;
  append(`игра «${entry.label}» создана`);
  created.start();
}

/** Имя игрока по id: в логе читать имена полезнее, чем идентификаторы. */
function nameOf(playerId: string): string {
  return snapshot.value?.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function makeMove(playerId: string): void {
  const current = session.value;
  if (!current) return;
  const accepted = current.makeMove(playerId, { step: 1 });
  append(`ход ${nameOf(playerId)}: ${accepted ? "принят" : "отклонён"}`);
}

async function saveName(): Promise<void> {
  await platform.saveGlobalSettings({ name: playerName.value });
  // Имя меняется и в текущей партии: иначе новое имя применилось бы только
  // после создания заново.
  session.value?.renamePlayer("p1", playerName.value);
  append(`имя сохранено: ${playerName.value}`);
}

onMounted(async () => {
  const settings = await platform.loadGlobalSettings();
  playerName.value = settings.name;
  append(`настройки загружены: имя «${settings.name}»`);
  await startSession();
});
</script>

<template>
  <section class="test-panel">
    <header class="test-panel__row">
      <strong>test-game</strong>
      <span v-if="snapshot" class="test-panel__state">
        {{ snapshot.state }}
        <template v-if="snapshot.currentPlayerId">
          · ходит {{ nameOf(snapshot.currentPlayerId) }}
        </template>
        <template v-if="snapshot.winnerId"> · победил {{ nameOf(snapshot.winnerId) }}</template>
      </span>
    </header>

    <p v-if="error" class="test-panel__error">{{ error }}</p>

    <div class="test-panel__row">
      <button type="button" @click="makeMove('p1')">Ход игрока 1</button>
      <button type="button" @click="makeMove('p2')">Ход игрока 2</button>
      <button type="button" @click="startSession">Заново</button>
    </div>

    <div class="test-panel__row">
      <label class="test-panel__field">
        Имя
        <input v-model="playerName" type="text" maxlength="20" @change="saveName" />
      </label>
    </div>

    <ol v-if="snapshot" class="test-panel__players">
      <li v-for="player in snapshot.players" :key="player.id">
        {{ player.name }} — {{ player.agent }} / {{ player.transport }}
      </li>
    </ol>

    <ul class="test-panel__log">
      <li v-for="(line, index) in log" :key="index">{{ line }}</li>
    </ul>
  </section>
</template>

<style scoped>
.test-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  max-height: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card);
  overflow: auto;
}

.test-panel__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.test-panel__state {
  opacity: 0.7;
  font-size: 0.85rem;
}

.test-panel__error {
  margin: 0;
  color: var(--danger);
}

.test-panel__field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.test-panel__players,
.test-panel__log {
  margin: 0;
  padding-left: 18px;
  font-size: 0.8rem;
  opacity: 0.85;
}

.test-panel__log {
  max-height: 180px;
  overflow: auto;
}
</style>
