import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TurnstileField } from "../components/turnstile-field";

describe("TurnstileField", () => {
  it("gives the widget container a semantic role for its accessible label", () => {
    render(<TurnstileField siteKey="1x00000000000000000000AA" action="submit_site" onToken={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Anti-bot verification" })).toBeInTheDocument();
  });
});
