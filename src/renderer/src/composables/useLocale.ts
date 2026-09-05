import { computed, type ComputedRef } from "vue";
import { useSettingsStore } from "@/stores/settings";

export type LocalizedText = { ru: string; en: string; es: string };

/** Small typed localization helper. Russian remains the source language. */
export function useLocale(): {
  language: ComputedRef<"ru" | "en" | "es">;
  tr: (ru: string, en: string, es: string) => string;
} {
  const settings = useSettingsStore();
  const language = computed(() => settings.settings?.language ?? "ru");
  const tr = (ru: string, en: string, es: string): string =>
    language.value === "en" ? en : language.value === "es" ? es : ru;
  return { language, tr };
}
