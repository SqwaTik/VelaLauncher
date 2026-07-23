import { createRouter, createWebHashHistory } from "vue-router";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/home" },
    {
      path: "/home",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
      meta: { title: "Главная" },
    },
    {
      path: "/mods",
      name: "mods",
      component: () => import("@/views/ModsView.vue"),
      meta: { title: "Моды" },
    },
    {
      path: "/resources",
      name: "resources",
      component: () => import("@/views/ModsView.vue"),
      meta: { title: "Ресурспаки" },
    },
    {
      path: "/account",
      name: "account",
      component: () => import("@/views/AccountView.vue"),
      meta: { title: "Аккаунт" },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
      meta: { title: "Настройки" },
    },
  ],
});
