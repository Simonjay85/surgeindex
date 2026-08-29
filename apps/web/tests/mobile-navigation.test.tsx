import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNavigation } from "../components/mobile-navigation";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigationState.pathname }));

describe("MobileNavigation", () => {
  afterEach(() => {
    cleanup();
    navigationState.pathname = "/";
    document.body.style.removeProperty("overflow");
  });

  it("opens an accessible drawer and keeps Radar out until explicitly enabled", () => {
    document.body.style.overflow = "auto";
    render(<MobileNavigation radarEnabled={false} />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Radar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard / Sign in" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    const closeButton = screen.getByRole("button", { name: "Close menu" });
    const links = screen.getAllByRole("link");
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(links.at(-1)).toHaveFocus();
    links.at(-1)?.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();
    const backdrop = document.querySelector<HTMLButtonElement>(".mobile-nav-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("renders Radar only when the public flag is enabled", () => {
    render(<MobileNavigation radarEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("link", { name: "Radar" })).toHaveAttribute("href", "/radar");
  });

  it("closes the drawer automatically when the route changes", () => {
    const { rerender } = render(<MobileNavigation radarEnabled={false} />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    navigationState.pathname = "/rankings";
    rerender(<MobileNavigation radarEnabled={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
