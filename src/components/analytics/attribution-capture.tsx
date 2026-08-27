"use client";
import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Невидимый компонент: на первом рендере фиксирует источник перехода (UTM)
 * в localStorage (first-touch). Монтируется один раз в корневом layout.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
