"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client-api";

export function ProviderBadge() {
  const [status, setStatus] = React.useState<{ llm: string; image: string } | null>(null);

  React.useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;
  const isMock = status.llm === "mock" || status.image === "mock";

  return (
    <Badge variant={isMock ? "warning" : "success"} className="gap-1.5">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${
            isMock ? "bg-amber-500" : "bg-emerald-500"
          } opacity-60`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            isMock ? "bg-amber-500" : "bg-emerald-500"
          }`}
        />
      </span>
      <span className="hidden sm:inline">{isMock ? "Демо-режим (mock)" : "AI подключён"}</span>
    </Badge>
  );
}
