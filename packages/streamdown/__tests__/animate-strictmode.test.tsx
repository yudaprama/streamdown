import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Streamdown } from "../index";

// Regression guard for the render-phase controller stepping. `useAnimation`
// steps the AnimationController during render; StrictMode invokes a render
// twice per commit. If each invoke read a fresh `performance.now()`, the second
// invoke would advance the controller across the just-started chunk and settle
// everything instantly — the cascade would snap rather than fade. The per-tick
// `now` latch makes the second invoke a no-op. We stub `performance.now` to jump
// a large amount on every call so an un-latched stepping would visibly snap.

beforeEach(() => {
  vi.useFakeTimers();
  let t = 0;
  vi.stubGlobal("performance", {
    now: () => {
      t += 1000;
      return t;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Streamdown animation under StrictMode", () => {
  it("does not snap to fully-settled on the first commit (idempotent stepping)", () => {
    const { container } = render(
      <StrictMode>
        <Streamdown animated isAnimating mode="streaming">
          {"alpha beta gamma delta epsilon"}
        </Streamdown>
      </StrictMode>
    );

    // With the latch, the opening chunk is still animating, so word spans carry
    // data-sd-animate. Without it, the double-invoke would settle them all to
    // data-sd-shown on the first commit.
    const animating = container.querySelectorAll("[data-sd-animate]").length;
    expect(
      animating,
      "animation snapped to fully settled under StrictMode"
    ).toBeGreaterThan(0);
  });
});
