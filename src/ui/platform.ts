import type { InjectionKey } from "vue";
import type { Platform } from "@/core/platform";

// Ключ внедрения платформы. Composition root (`main.ts`) создаёт её и
// предоставляет, компоненты — только читают. Так платформа остаётся
// экземпляром, а не скрытым модульным синглтоном.
export const platformKey: InjectionKey<Platform> = Symbol("platform");
