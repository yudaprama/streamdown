import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Streamdown } from "../index";

// `reserveSpace` is a pure root-level CSS toggle: it sets `--sd-hidden-display`
// so unrevealed segments fade opacity in place (stable layout) instead of
// collapsing with `display: none`. The transform/controller are unaffected.

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("performance", { now: () => 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rootOf = (container: HTMLElement): HTMLElement =>
  container.firstElementChild as HTMLElement;

describe("animated reserveSpace option", () => {
  it("sets --sd-hidden-display: revert on the root when enabled", () => {
    const { container } = render(
      <Streamdown
        animated={{ reserveSpace: true }}
        isAnimating
        mode="streaming"
      >
        {"alpha beta gamma"}
      </Streamdown>
    );
    expect(
      rootOf(container).style.getPropertyValue("--sd-hidden-display")
    ).toBe("revert");
  });

  it("leaves the variable unset by default (collapse mode)", () => {
    const { container } = render(
      <Streamdown animated isAnimating mode="streaming">
        {"alpha beta gamma"}
      </Streamdown>
    );
    expect(
      rootOf(container).style.getPropertyValue("--sd-hidden-display")
    ).toBe("");
  });
});
