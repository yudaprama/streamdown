import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Streamdown } from "../index";

describe("Single tilde handling (#545)", () => {
  it("should not render single tilde as strikethrough", () => {
    const content = "~foo~ is not strikethrough";
    const { container } = render(<Streamdown>{content}</Streamdown>);

    // Single tilde should NOT create a <del> element
    const del = container.querySelector("del");
    expect(del).toBeNull();

    // Text content should contain the tilde characters
    const text = container.textContent;
    expect(text).toContain("~foo~");
  });

  it("should still render double tilde as strikethrough", () => {
    const content = "~~strikethrough~~";
    const { container } = render(<Streamdown>{content}</Streamdown>);

    // Double tilde SHOULD create a <del> element
    const del = container.querySelector("del");
    expect(del).not.toBeNull();
    expect(del?.textContent).toBe("strikethrough");
  });

  it("should not render single ~ between words as strikethrough", () => {
    const content = "Temperature range is 20~25°C";
    const { container } = render(<Streamdown>{content}</Streamdown>);

    const del = container.querySelector("del");
    expect(del).toBeNull();

    const text = container.textContent;
    expect(text).toContain("20~25");
  });
});
