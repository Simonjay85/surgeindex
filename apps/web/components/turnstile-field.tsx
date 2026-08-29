"use client";

import { useEffect, useRef } from "react";

type TurnstileWidget = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action?: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

export function TurnstileField({ siteKey, action, onToken }: { siteKey?: string; action: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let disposed = false;
    const render = () => {
      if (disposed || !containerRef.current || !window.turnstile || widgetRef.current) return;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-surgeindex-turnstile]");
    if (existing) {
      render();
      existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.surgeindexTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [action, onToken, siteKey]);
  return siteKey ? <div ref={containerRef} role="group" aria-label="Anti-bot verification" /> : null;
}
