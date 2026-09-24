"use client";
import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";
import { captureReferral } from "@/lib/referral";

/**
 * Невидимый компонент: на первом рендере фиксирует источник перехода (UTM)
 * и код пригласившего (?ref=) в localStorage — оба first-touch.
 * Монтируется один раз в корневом layout.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
    captureReferral();
  }, []);
  return null;
}
