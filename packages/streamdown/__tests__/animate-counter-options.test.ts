import { renderHook } from "@testing-library/react";
import type { Root } from "hast";
import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATE_CONFIG } from "../lib/animate/transform";
import { useAnimation } from "../lib/animate/use-animation";
import type { Options } from "../lib/markdown";

// A rehype plugin that injects one extra word segment, so the same block string
// counts differently depending on whether it's in the pipeline.
const addSegment = () => (tree: Root) => {
  tree.children.push({
    type: "element",
    tagName: "p",
    properties: {},
    children: [{ type: "text", value: "extra" }],
  });
};

const baseOptions: Readonly<Omit<Options, "children">> = {
  components: {},
  remarkPlugins: [],
  rehypePlugins: [],
};

describe("useAnimation segment counter", () => {
  it("rebuilds the counter when countingOptions change mid-stream", () => {
    const { result, rerender } = renderHook(
      ({ opts }: { opts: Readonly<Omit<Options, "children">> }) =>
        useAnimation({
          blocks: ["hello"],
          config: DEFAULT_ANIMATE_CONFIG,
          isAnimating: false,
          countingOptions: opts,
        }),
      { initialProps: { opts: baseOptions } }
    );

    // "hello" is a single word segment.
    expect(result.current[0].plan.settledEnd).toBe(1);

    // New options add a segment to the same block. A counter that only rebuilt
    // on config changes would keep the stale cached count of 1.
    rerender({ opts: { ...baseOptions, rehypePlugins: [addSegment] } });
    expect(result.current[0].plan.settledEnd).toBe(2);
  });
});
