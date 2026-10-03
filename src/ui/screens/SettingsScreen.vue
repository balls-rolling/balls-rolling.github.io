<script setup lang="ts">
// Настройки: форма строится из метаданных платформы, а не из разметки.
// Значения живут в управляющем объекте формы, шаблон читает их через адаптер.
import { inject, onMounted, ref } from "vue";
import { GLOBAL_NAME_CONTROL } from "@/core/platform";
import { createFormController, type FormHandle } from "@/core/form";
import { FormView, useFieldValue } from "@/ui/form";
import { platformKey } from "@/ui/platform";

const injected = inject(platformKey);
if (!injected) throw new Error("Платформа не предоставлена");
const platform = injected;

const handle: FormHandle = createFormController(platform.globalForm());
const { valueOf, setValue } = useFieldValue(handle);

const savedNote = ref("");
// `lastGameId` — не настройка пользователя, но при сохранении его надо не потерять.
let lastGameId = "";

onMounted(async () => {
  const settings = await platform.loadGlobalSettings();
  lastGameId = settings.lastGameId;
  handle.setValue(GLOBAL_NAME_CONTROL, settings.name);
});

async function save(): Promise<void> {
  const name = String(handle.getValue(GLOBAL_NAME_CONTROL) ?? "").trim();
  await platform.saveGlobalSettings({ name, lastGameId });
  savedNote.value = `Сохранено: ${name}`;
}
</script>

<template>
  <div class="settings-screen">
    <FormView
      :nodes="platform.globalForm().nodes"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="handle.emit"
    />
    <button type="button" @click="save">Сохранить</button>
    <p v-if="savedNote" class="settings-screen__note">{{ savedNote }}</p>
  </div>
</template>

<style scoped>
.settings-screen {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-screen__note {
  margin: 0;
  opacity: 0.7;
}
</style>
