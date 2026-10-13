"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const byHour = () => {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

/** Uses the device clock, so it renders a neutral greeting on the server. */
export default function Greeting() {
  return <>{useSyncExternalStore(noop, byHour, () => "Welcome back")}</>;
}
