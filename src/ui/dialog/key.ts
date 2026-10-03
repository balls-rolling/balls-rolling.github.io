import type { InjectionKey } from "vue";
import type { DialogManager } from "./manager";

// Ключ внедрения менеджера диалогов. Composition root создаёт его и
// предоставляет; экраны и игры получают менеджер отсюда, а не из модульного
// синглтона — так его можно подменить в тестах.
export const dialogKey: InjectionKey<DialogManager> = Symbol("dialogs");
