"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False through SSR and the hydrating render, true from mount onward.
 *
 * Motion components use it to render plain, visible markup on the server and
 * only take over once there is a browser to animate in — so a page whose
 * JavaScript never arrives is never left holding hidden content.
 */
export function useMounted() {
  return useSyncExternalStore(noop, onClient, onServer);
}
