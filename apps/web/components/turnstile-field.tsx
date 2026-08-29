"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileWidget = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId?: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

export type TurnstileState = "loading" | "ready" | "verified" | "expired" | "error";

type TurnstileFieldProps = {
  siteKey?: string;
  action: string;
  onToken: (token: string) => void;
  onStateChange?: (state: TurnstileState) => void;
  /** Increment to force a fresh widget and discard the previous token. */
  resetNonce?: number;
};

const SCRIPT_SELECTOR = 'script[data-surgeindex-turnstile="true"]';
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileField({ siteKey, action, onToken, onStateChange, resetNonce = 0 }: TurnstileFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const tokenHandlerRef = useRef(onToken);
  const stateHandlerRef = useRef(onStateChange);
  const [state, setState] = useState<TurnstileState>(siteKey ? "loading" : "ready");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => { tokenHandlerRef.current = onToken; }, [onToken]);
  useEffect(() => { stateHandlerRef.current = onStateChange; }, [onStateChange]);

  useEffect(() => {
    const updateState = (next: TurnstileState) => {
      setState(next);
      stateHandlerRef.current?.(next);
    };

    if (!siteKey) {
      tokenHandlerRef.current("");
      updateState("ready");
      return;
    }

    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let script: HTMLScriptElement | null = null;
    const container = containerRef.current;

    const renderWidget = () => {
      if (disposed || !container || !window.turnstile || widgetRef.current) return;
      try {
        widgetRef.current = window.turnstile.render(container, {
          sitekey: siteKey,
          action,
          callback: (token: string) => {
            if (disposed) return;
            tokenHandlerRef.current(token);
            updateState(token ? "verified" : "error");
          },
          "expired-callback": () => {
            tokenHandlerRef.current("");
            updateState("expired");
          },
          "error-callback": () => {
            tokenHandlerRef.current("");
            updateState("error");
          },
        });
        updateState("ready");
      } catch {
        tokenHandlerRef.current("");
        updateState("error");
      }
    };

    const handleLoad = () => {
      if (timeoutId) clearTimeout(timeoutId);
      renderWidget();
    };
    const handleError = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (script) script.dataset.surgeindexTurnstileState = "error";
      tokenHandlerRef.current("");
      updateState("error");
    };

    script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    // A failed script element never emits another load event. Remove only the
    // marked failed element so retry can create a single fresh loader.
    if (script?.dataset.surgeindexTurnstileState === "error") {
      script.remove();
      script = null;
    }
    if (window.turnstile) {
      renderWidget();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.dataset.surgeindexTurnstile = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      timeoutId = setTimeout(() => {
        if (disposed || widgetRef.current) return;
        if (script) script.dataset.surgeindexTurnstileState = "error";
        tokenHandlerRef.current("");
        updateState("error");
      }, 8_000);
    }

    return () => {
      disposed = true;
      if (timeoutId) clearTimeout(timeoutId);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      if (widgetRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetRef.current); } catch { /* cleanup is best effort */ }
      }
      widgetRef.current = null;
      tokenHandlerRef.current("");
    };
  }, [action, resetNonce, retryNonce, siteKey]);

  if (!siteKey) return null;
  const stateLabel = {
    loading: "Loading anti-bot verification…",
    ready: "Complete the anti-bot verification to continue.",
    verified: "Anti-bot verification complete.",
    expired: "Verification expired. Try again.",
    error: "Anti-bot verification could not load.",
  }[state];

  return <div className="turnstile-field">
    <div ref={containerRef} role="group" aria-label="Anti-bot verification" />
    <div className={`turnstile-status turnstile-status-${state}`} role="status" aria-live="polite">{stateLabel}{state === "error" || state === "expired" ? <button type="button" className="text-link" onClick={() => setRetryNonce((current) => current + 1)}>Retry verification</button> : null}</div>
  </div>;
}
