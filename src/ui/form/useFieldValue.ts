import { ref } from "vue";
import type { FormHandle } from "@/core/form";

// Адаптер реактивности между внешним `FormHandle` и шаблоном Vue.
//
// Источник истины — handle, копии значений не держим: иначе получилось бы два
// состояния, которые рано или поздно разойдутся. Реактивность обеспечивается
// счётчиком версии: чтение `valueOf` подписывает шаблон на версию, запись через
// `setValue` версию увеличивает.
//
// Ограничение: внешний вызов `handle.setValue`/`patch` версию не поднимет, и
// шаблон о нём не узнает. В этой фазе форму извне никто не меняет; если это
// понадобится, ядру потребуется сигнал изменения значений.
export function useFieldValue(handle: FormHandle) {
  const version = ref(0);

  const valueOf = (id: string): unknown => {
    // Чтение версии — это и есть подписка шаблона на изменения.
    void version.value;
    return handle.getValue(id);
  };

  const setValue = (id: string, value: unknown): void => {
    handle.setValue(id, value);
    version.value += 1;
  };

  return { valueOf, setValue };
}
