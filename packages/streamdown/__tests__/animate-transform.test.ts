import type { Element, Root } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import {
  applyAnimation,
  DEFAULT_ANIMATE_CONFIG,
  enumerateSegments,
} from "../lib/animate/transform";

const parse = (html: string): Root =>
  unified().use(rehypeParse, { fragment: true }).parse(html) as Root;

const findAll = (
  root: Root | Element,
  pred: (el: Element) => boolean
): Element[] => {
  const out: Element[] = [];
  const walk = (children: Array<{ type: string }>) => {
    for (const child of children) {
      if (child.type === "element") {
        const el = child as unknown as Element;
        if (pred(el)) {
          out.push(el);
        }
        walk(el.children as Array<{ type: string }>);
      }
    }
  };
  walk(root.children as Array<{ type: string }>);
  return out;
};

const textOf = (el: Element): string =>
  el.children.map((c) => (c.type === "text" ? c.value : "")).join("");

const DELAY_RE = /--sd-delay:(\d+)ms/;

const delayOf = (el: Element): number => {
  const style = String(el.properties?.style ?? "");
  const m = style.match(DELAY_RE);
  return m ? Number(m[1]) : Number.NaN;
};

describe("enumerateSegments", () => {
  it("counts non-whitespace word units", () => {
    const segs = enumerateSegments(parse("<p>hello world foo</p>"));
    expect(segs).toHaveLength(3);
    expect(segs.every((s) => !s.atomic)).toBe(true);
  });

  it("counts characters in char mode, ignoring whitespace", () => {
    const segs = enumerateSegments(parse("<p>ab c</p>"), {
      ...DEFAULT_ANIMATE_CONFIG,
      sep: "char",
    });
    expect(segs).toHaveLength(3);
  });

  it("treats code blocks and images as single atomic segments", () => {
    const segs = enumerateSegments(
      parse("<p>hi</p><pre><code>x = 1</code></pre><img src='a.png'>")
    );
    expect(segs.map((s) => s.atomic)).toEqual([false, true, true]);
  });
});

describe("applyAnimation zones", () => {
  it("splits a paragraph into settled / active / pending", () => {
    const tree = parse("<p>a b c</p>");
    applyAnimation(tree, { settledEnd: 1, activeEnd: 2 });
    const p = findAll(tree, (el) => el.tagName === "p")[0];

    const shownWords = findAll(
      p,
      (el) => el.properties?.["data-sd-shown"] === true
    ).filter((el) => textOf(el).trim().length > 0);
    expect(shownWords).toHaveLength(1);
    expect(textOf(shownWords[0])).toBe("a");
    const active = findAll(
      p,
      (el) => el.properties?.["data-sd-animate"] === true
    );
    expect(active).toHaveLength(1);
    expect(textOf(active[0])).toBe("b");
    const hidden = findAll(
      p,
      (el) => el.properties?.["data-sd-hidden"] === true
    );
    expect(hidden).toHaveLength(1);
    expect(textOf(hidden[0])).toBe("c");
  });

  it("staggers active delays by ordinal within the chunk", () => {
    const tree = parse("<p>a b c</p>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 3 });
    const spans = findAll(
      tree,
      (el) => el.properties?.["data-sd-animate"] === true
    );
    expect(spans.map(delayOf)).toEqual([0, 40, 80]);
  });

  it("annotates an atomic element directly when active", () => {
    const tree = parse("<img src='a.png'>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 1 });
    const img = findAll(tree, (el) => el.tagName === "img")[0];
    expect(img.properties?.["data-sd-animate"]).toBe(true);
    expect(delayOf(img)).toBe(0);
  });

  it("does not descend into atomic elements", () => {
    const tree = parse("<pre><code>x = 1</code></pre>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 1 });
    const code = findAll(tree, (el) => el.tagName === "code")[0];
    expect(findAll(code, () => true)).toHaveLength(0);
    expect(textOf(code)).toBe("x = 1");
  });
});

describe("parent cascade", () => {
  it("gives a fully-active container display-only appear at the min delay", () => {
    const tree = parse("<ul><li>a b</li></ul>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 2 });
    const li = findAll(tree, (el) => el.tagName === "li")[0];
    const ul = findAll(tree, (el) => el.tagName === "ul")[0];
    expect(li.properties?.["data-sd-appear"]).toBe(true);
    expect(delayOf(li)).toBe(0);
    expect(ul.properties?.["data-sd-appear"]).toBe(true);
  });

  it("hides a fully-pending container", () => {
    const tree = parse("<ul><li>a b</li></ul>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 0 });
    const li = findAll(tree, (el) => el.tagName === "li")[0];
    const ul = findAll(tree, (el) => el.tagName === "ul")[0];
    expect(li.properties?.["data-sd-hidden"]).toBe(true);
    expect(ul.properties?.["data-sd-hidden"]).toBe(true);
  });

  it("leaves a container that already has settled content visible", () => {
    const tree = parse("<p>a b</p>");
    applyAnimation(tree, { settledEnd: 1, activeEnd: 2 });
    const p = findAll(tree, (el) => el.tagName === "p")[0];
    expect(p.properties?.["data-sd-appear"]).toBeUndefined();
    expect(p.properties?.["data-sd-hidden"]).toBeUndefined();
  });
});

describe("enumerate / applyAnimation agreement", () => {
  it("enumerated count matches the ordinal space used by applyAnimation", () => {
    const html = "<p>one two</p><pre><code>code</code></pre><p>three</p>";
    const total = enumerateSegments(parse(html)).length;
    const tree = parse(html);
    applyAnimation(tree, { settledEnd: 0, activeEnd: total });
    const animated = findAll(
      tree,
      (el) => el.properties?.["data-sd-animate"] === true
    );
    // 3 text words + 1 atomic pre = 4 animation annotations, none pending.
    expect(total).toBe(4);
    expect(animated).toHaveLength(4);
  });
});

describe("void element animation (hr)", () => {
  it("annotates hr as atomic with data-sd-animate when active", () => {
    const tree = parse("<hr>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 1 });
    const hr = findAll(tree, (el) => el.tagName === "hr")[0];
    expect(hr.properties?.["data-sd-animate"]).toBe(true);
    expect(delayOf(hr)).toBe(0);
  });

  it("hides an hr that is still pending", () => {
    const tree = parse("<hr>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 0 });
    const hr = findAll(tree, (el) => el.tagName === "hr")[0];
    expect(hr.properties?.["data-sd-hidden"]).toBe(true);
  });

  it("counts hr as a single atomic segment alongside text words", () => {
    const segs = enumerateSegments(parse("<p>hello</p><hr><p>world</p>"));
    expect(segs).toHaveLength(3);
    expect(segs[0].atomic).toBe(false);
    expect(segs[1].atomic).toBe(true);
    expect(segs[2].atomic).toBe(false);
  });
});

describe("list marker and checkbox", () => {
  it("stamps marker animation vars on a list item with active content", () => {
    const tree = parse("<ul><li>Hello world</li></ul>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 2 });
    const li = findAll(tree, (el) => el.tagName === "li")[0];
    expect(li.properties?.["data-sd-animate-marker"]).toBe(true);
    const style = String(li.properties?.style ?? "");
    expect(style).toContain("--sd-marker-duration:150ms");
    expect(style).toContain("--sd-marker-easing:ease");
  });

  it("does not stamp marker vars on settled list items", () => {
    const tree = parse("<ul><li>Hello</li></ul>");
    applyAnimation(tree, { settledEnd: 1, activeEnd: 1 });
    const li = findAll(tree, (el) => el.tagName === "li")[0];
    expect(li.properties?.["data-sd-animate-marker"]).toBeUndefined();
  });

  it("stamps animation on a task-list checkbox", () => {
    const tree = parse(
      '<ul><li class="task-list-item"><input type="checkbox" disabled=""> Hello</li></ul>'
    );
    applyAnimation(tree, { settledEnd: 0, activeEnd: 2 });
    const input = findAll(tree, (el) => el.tagName === "input")[0];
    expect(input.properties?.["data-sd-animate"]).toBe(true);
    const style = String(input.properties?.style ?? "");
    expect(style).toContain("--sd-animation:sd-fadeIn");
    expect(style).toContain("--sd-duration:150ms");
  });

  it("does not stamp checkbox for items outside lists", () => {
    const tree = parse('<p><input type="checkbox"> Hello</p>');
    applyAnimation(tree, { settledEnd: 0, activeEnd: 1 });
    const input = findAll(tree, (el) => el.tagName === "input")[0];
    expect(input.properties?.["data-sd-animate"]).toBeUndefined();
  });
});

describe("link whitespace merging", () => {
  it("does not break inside links", () => {
    const tree = parse('<a href="/">Hello world</a>');
    applyAnimation(tree, { settledEnd: 0, activeEnd: 2 });
    const spanTexts = findAll(
      tree,
      (el) => el.tagName === "span"
    ).map((s) => {
      const c = s.children[0];
      return c?.type === "text" ? c.value : "";
    });
    // Inside a link, the space should be merged into the preceding word.
    // "Hello " + "world" = 2 spans (merged) vs "Hello" + " " + "world" = 3.
    expect(spanTexts.join("")).toBe("Hello world");
  });

  it("preserves whitespace between spans outside links", () => {
    const tree = parse("<p>Hello world</p>");
    applyAnimation(tree, { settledEnd: 0, activeEnd: 2 });
    const spanTexts = findAll(tree, (el) => el.tagName === "span")
      .filter((s) => {
        const hasAttr = s.properties?.["data-sd-animate"] || s.properties?.["data-sd-shown"];
        return hasAttr;
      })
      .map((s) => (s.children[0]?.type === "text" ? s.children[0].value : ""));
    expect(spanTexts).toEqual(["Hello", " ", "world"]);
  });
});

describe("stable animation keys", () => {
  const keyOf = (el: Element): string =>
    String(el.properties?.["data-sd-key"] ?? "");

  it("derives identical keys for leading text across re-renders as the frontier advances", () => {
    const html = "<p>hello world foo</p>";

    const first = parse(html);
    applyAnimation(first, { settledEnd: 1, activeEnd: 3 });
    const second = parse(html);
    applyAnimation(second, { settledEnd: 3, activeEnd: 3 });

    const wordSpans = (tree: Root) =>
      findAll(tree, (el) => el.tagName === "span" && !!textOf(el).trim());
    const a = wordSpans(first);
    const b = wordSpans(second);

    expect(a.map(textOf)).toEqual(["hello", "world", "foo"]);
    // Same source offsets => same keys, even though zones differ between passes.
    expect(a.map(keyOf)).toEqual(b.map(keyOf));
    // The leading word keeps its key while its zone flips active -> settled.
    expect(a[0].properties?.["data-sd-animate"]).toBeUndefined();
    expect(a[0].properties?.["data-sd-shown"]).toBe(true);
    expect(b[0].properties?.["data-sd-shown"]).toBe(true);
  });

  it("assigns unique, prefixed keys to every wrapped node", () => {
    const tree = parse("<p>alpha beta</p>");
    applyAnimation(tree, { settledEnd: 1, activeEnd: 2 });
    const spanKeys = findAll(tree, (el) => el.tagName === "span").map(keyOf);
    const containerKey = keyOf(findAll(tree, (el) => el.tagName === "p")[0]);

    expect(new Set(spanKeys).size).toBe(spanKeys.length);
    expect(spanKeys.every((k) => k.startsWith("t"))).toBe(true);
    expect(containerKey.startsWith("c")).toBe(true);
  });

  it("marks containers with active/pending descendants as animating, drops it once settled", () => {
    const animating = parse("<p>alpha beta</p>");
    applyAnimation(animating, { settledEnd: 1, activeEnd: 2 });
    expect(
      findAll(animating, (el) => el.tagName === "p")[0].properties?.[
        "data-sd-animating"
      ]
    ).toBe(true);

    const settled = parse("<p>alpha beta</p>");
    applyAnimation(settled, { settledEnd: 2, activeEnd: 2 });
    expect(
      findAll(settled, (el) => el.tagName === "p")[0].properties?.[
        "data-sd-animating"
      ]
    ).toBeUndefined();
  });
});
