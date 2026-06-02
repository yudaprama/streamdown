import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Streamdown } from "../index";

// Drives the real <Streamdown> through a simulated streaming sequence and
// asserts the final DOM contains the complete text. Reproduces the animation
// reconciliation bug (trailing / inline content dropped) without a browser.

const FULL = [
  "## Streaming a response",
  "",
  "Here's how Otto streams a reply **chunk by chunk**, rendered live with `Streamdown`.",
  "",
  "- First, it sends the opening tokens",
  "- Then it keeps going, _word by word_",
  "",
  "That's the end of the simulated message.",
].join("\n");

let clock = 0;

beforeEach(() => {
  clock = 0;
  vi.useFakeTimers();
  vi.stubGlobal("performance", { now: () => clock });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const advance = (ms: number) => {
  clock += ms;
  vi.advanceTimersByTime(ms);
};

describe("Streamdown streaming animation", () => {
  const findWordSpan = (
    container: HTMLElement,
    word: string
  ): HTMLElement | null =>
    Array.from(container.querySelectorAll("span")).find(
      (span) => span.childElementCount === 0 && span.textContent === word
    ) ?? null;

  it("renders the complete message after a streamed animation finishes", () => {
    const { container, rerender } = render(
      <Streamdown animated isAnimating mode="streaming">
        {FULL.slice(0, 3)}
      </Streamdown>
    );

    // Stream in 3-char chunks at 25ms (matching the workshop), so the animation
    // lags behind and is still mid-flight when the stream ends.
    for (let i = 6; i <= FULL.length; i += 3) {
      act(() => {
        rerender(
          <Streamdown animated isAnimating mode="streaming">
            {FULL.slice(0, i)}
          </Streamdown>
        );
        advance(25);
      });
    }

    // Capture an animated word's DOM node before the drain so we can prove the
    // backlog drains in place (no remount) afterwards.
    const captured = findWordSpan(container, "Streaming");
    expect(
      captured,
      "expected a 'Streaming' word span mid-stream"
    ).not.toBeNull();

    // Stream ends: isAnimating goes false but the full content stays. The
    // animation should keep draining its backlog to completion.
    act(() => {
      rerender(
        <Streamdown animated isAnimating={false} mode="streaming">
          {FULL}
        </Streamdown>
      );
    });

    // Let the post-stream drain run to completion.
    for (let i = 0; i < 100; i += 1) {
      act(() => {
        advance(200);
      });
    }

    // Once drained nothing should remain hidden or waiting to appear.
    expect(
      container.querySelectorAll("[data-sd-hidden]").length,
      "stuck data-sd-hidden elements remain after finalize"
    ).toBe(0);
    expect(
      container.querySelectorAll("[data-sd-appear]").length,
      "stuck data-sd-appear elements remain after finalize"
    ).toBe(0);

    // The stable-key sentinel must never reach the DOM.
    expect(
      container.querySelectorAll("[data-sd-key]").length,
      "data-sd-key sentinel leaked to the DOM"
    ).toBe(0);

    // No remount: the node captured mid-stream is still in the tree.
    expect(
      captured?.isConnected,
      "drain remounted instead of reconciling in place"
    ).toBe(true);

    const text = container.textContent ?? "";
    for (const fragment of [
      "Streaming a response",
      "chunk by chunk",
      "rendered live with",
      "Streamdown",
      "First, it sends the opening tokens",
      "word by word",
      "That's the end of the simulated message.",
    ]) {
      expect(text, `missing: ${fragment}`).toContain(fragment);
    }
  });

  it("preserves DOM node identity when incomplete bold morphs to complete", () => {
    const { container, rerender } = render(
      <Streamdown animated isAnimating mode="streaming">
        {"**chunk"}
      </Streamdown>
    );

    // Animate the "chunk" word (remend completes `**chunk` to `**chunk**`).
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        advance(50);
      });
    }
    const before = findWordSpan(container, "chunk");
    expect(before, "expected a 'chunk' word span").not.toBeNull();

    // Append more bold text. The leading "chunk" keeps its source offset (and
    // thus its key), so its DOM node must survive the structural morph.
    act(() => {
      rerender(
        <Streamdown animated isAnimating mode="streaming">
          {"**chunk by chunk**"}
        </Streamdown>
      );
    });
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        advance(50);
      });
    }

    const after = findWordSpan(container, "chunk");
    expect(after, "drop of leading 'chunk' across the morph").toBe(before);
  });
});
