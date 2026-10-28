import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnstileField } from "../components/turnstile-field";

describe("TurnstileField", () => {
  afterEach(() => {
    delete window.turnstile;
    document.querySelectorAll('script[data-surgeindex-turnstile="true"]').forEach((script) => script.remove());
  });

  it("gives the widget container a semantic role for its accessible label", () => {
    render(<TurnstileField siteKey="1x00000000000000000000AA" action="submit_site" onToken={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Anti-bot verification" })).toBeInTheDocument();
  });

  it("reports the state machine and removes the previous widget on reset", async () => {
    let callbacks: Record<string, unknown> = {};
    const remove = vi.fn();
    window.turnstile = {
      render: vi.fn((_container, options) => { callbacks = options; return "widget-1"; }),
      remove,
      reset: vi.fn(),
    };
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const { rerender } = render(<TurnstileField siteKey="test-key" action="signup" onToken={onToken} onStateChange={onStateChange} />);
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith("ready"));
    act(() => { (callbacks.callback as (token: string) => void)("opaque-token"); });
    expect(onToken).toHaveBeenCalledWith("opaque-token");
    expect(onStateChange).toHaveBeenCalledWith("verified");
    rerender(<TurnstileField siteKey="test-key" action="signup" onToken={onToken} onStateChange={onStateChange} resetNonce={1} />);
    expect(remove).toHaveBeenCalledWith("widget-1");
    expect(onToken).toHaveBeenLastCalledWith("");
  });
});
