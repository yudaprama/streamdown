/**
 * Regression guard for #410: ordered/unordered list animations re-triggering.
 *
 * Multiple lists are merged by the Marked lexer into a single block. As items
 * stream in, that block is re-parsed through the rehype pipeline. Under the
 * three-zone animation model this no longer re-animates already-visible content:
 *
 * 1. Each animated segment carries a stable `data-sd-key` derived from its source
 *    offset, so React reconciles existing spans in place instead of remounting
 *    them when the block re-parses.
 * 2. Already-revealed words sit in the settled zone (`data-sd-shown`), so they are
 *    never re-flagged as active (`data-sd-animate`) and never re-run the fade.
 */

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Streamdown } from "../index";

const animated = {
  animation: "fadeIn" as const,
  duration: 150,
  easing: "ease",
  sep: "word" as const,
};

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

// Advance well past any stagger/duration so the controller drains to settled.
const drain = () => {
  for (let i = 0; i < 50; i += 1) {
    act(() => {
      clock += 200;
      vi.advanceTimersByTime(200);
    });
  }
};

const wordSpan = (container: HTMLElement, word: string): HTMLElement | null =>
  Array.from(container.querySelectorAll("span")).find(
    (s) => s.childElementCount === 0 && s.textContent === word
  ) ?? null;

describe("list animation retrigger (#410)", () => {
  it("does not remount existing list-item spans when a new item appears", () => {
    const { container, rerender } = render(
      <Streamdown animated={animated} isAnimating mode="streaming">
        {"- Alpha\n- Bravo\n"}
      </Streamdown>
    );
    drain();

    const alpha = wordSpan(container, "Alpha");
    const bravo = wordSpan(container, "Bravo");
    expect(alpha, "expected an 'Alpha' word span").not.toBeNull();
    expect(bravo, "expected a 'Bravo' word span").not.toBeNull();

    // A new list item appears mid-stream (the merged block re-parses).
    act(() => {
      rerender(
        <Streamdown animated={animated} isAnimating mode="streaming">
          {"- Alpha\n- Bravo\n- Charlie\n"}
        </Streamdown>
      );
    });
    drain();

    // Stable keys reconcile the existing words in place — same DOM nodes.
    expect(alpha?.isConnected, "'Alpha' span remounted").toBe(true);
    expect(bravo?.isConnected, "'Bravo' span remounted").toBe(true);
    expect(wordSpan(container, "Charlie"), "new item missing").not.toBeNull();
  });

  it("does not re-animate already-settled words when an item's text grows", () => {
    const { container, rerender } = render(
      <Streamdown animated={animated} isAnimating mode="streaming">
        {"- Alpha\n"}
      </Streamdown>
    );
    drain();

    const alpha = wordSpan(container, "Alpha");
    expect(alpha?.hasAttribute("data-sd-shown"), "'Alpha' not settled").toBe(
      true
    );

    // The item's text grows during streaming (its node position extends).
    act(() => {
      rerender(
        <Streamdown animated={animated} isAnimating mode="streaming">
          {"- Alpha Bravo\n"}
        </Streamdown>
      );
    });

    // 'Alpha' stays the same settled node — not remounted, not re-animated.
    expect(alpha?.isConnected, "'Alpha' span remounted on growth").toBe(true);
    expect(
      alpha?.hasAttribute("data-sd-shown"),
      "settled 'Alpha' lost its shown state"
    ).toBe(true);
    expect(
      alpha?.hasAttribute("data-sd-animate"),
      "settled 'Alpha' was re-flagged for animation"
    ).toBe(false);

    // The newly-arrived word still animates in and settles.
    drain();
    expect(wordSpan(container, "Bravo"), "new word missing").not.toBeNull();
  });

  it("keeps content stable when `animated` is a fresh object of equal values", () => {
    // Inline object literals create a new reference each render; the value-keyed
    // memo must keep the controller/plugin stable so prior content is not torn
    // down and re-animated.
    const getAnimated = () => ({
      animation: "fadeIn" as const,
      duration: 150,
      easing: "ease",
      sep: "word" as const,
    });

    const { container, rerender } = render(
      <Streamdown animated={getAnimated()} isAnimating mode="streaming">
        {"- Alpha\n- Bravo\n"}
      </Streamdown>
    );
    drain();

    const alpha = wordSpan(container, "Alpha");
    expect(alpha, "expected an 'Alpha' word span").not.toBeNull();

    act(() => {
      rerender(
        <Streamdown animated={getAnimated()} isAnimating mode="streaming">
          {"- Alpha\n- Bravo\n- Charlie\n"}
        </Streamdown>
      );
    });
    drain();

    expect(alpha?.isConnected, "'Alpha' span remounted").toBe(true);
    expect(wordSpan(container, "Charlie"), "new item missing").not.toBeNull();
  });
});
