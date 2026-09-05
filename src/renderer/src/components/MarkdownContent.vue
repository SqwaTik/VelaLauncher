<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = defineProps<{ source?: string | null }>();
const html = computed(() =>
  DOMPurify.sanitize(
    marked.parse(props.source || "", {
      async: false,
      breaks: true,
      gfm: true,
    }) as string,
  ),
);

function followLink(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest(
    "a",
  ) as HTMLAnchorElement | null;
  if (!target?.href) return;
  event.preventDefault();
  void window.royale.app.openExternal(target.href);
}
</script>

<template><div class="markdown" v-html="html" @click="followLink" /></template>

<style scoped lang="scss">
.markdown {
  margin-top: 9px;
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.65;
  user-select: text;
  overflow-wrap: anywhere;
}
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4) {
  margin: 18px 0 7px;
  color: var(--text-0);
  line-height: 1.25;
}
.markdown :deep(h1) {
  font-size: 19px;
}
.markdown :deep(h2) {
  font-size: 16px;
}
.markdown :deep(h3) {
  font-size: 13px;
}
.markdown :deep(p) {
  margin: 8px 0;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 21px;
}
.markdown :deep(li) {
  margin: 4px 0;
}
.markdown :deep(a) {
  color: var(--green-bright);
  text-decoration: underline;
  text-decoration-color: rgba(92, 220, 121, 0.35);
  text-underline-offset: 3px;
}
.markdown :deep(a:hover) {
  text-decoration-color: currentColor;
}
.markdown :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 460px;
  margin: 12px auto;
  border-radius: 11px;
  object-fit: contain;
  background: #080d0a;
}
.markdown :deep(code) {
  padding: 2px 5px;
  border-radius: 5px;
  color: #b9efc5;
  background: #080d0a;
  font: 10px var(--font-num);
}
.markdown :deep(pre) {
  padding: 12px;
  overflow: auto;
  border-radius: 9px;
  background: #080d0a;
}
.markdown :deep(pre code) {
  padding: 0;
  background: none;
}
.markdown :deep(blockquote) {
  margin: 10px 0;
  padding: 7px 12px;
  border-left: 3px solid var(--green);
  color: var(--text-2);
  background: var(--green-soft);
}
.markdown :deep(hr) {
  margin: 15px 0;
  border: 0;
  border-top: 1px solid var(--hairline);
}
</style>
