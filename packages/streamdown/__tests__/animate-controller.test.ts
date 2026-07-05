import { describe, expect, it } from "vitest";
import { AnimationController } from "../lib/animate/controller";

const cfg = (
  over?: Partial<{ duration: number; stagger: number; coalesceCap: number }>
) => ({
  duration: 150,
  stagger: 40,
  coalesceCap: 1000,
  ...over,
});

const INF = Number.POSITIVE_INFINITY;

describe("AnimationController", () => {
  it("starts an active chunk over all available segments when idle", () => {
    const c = new AnimationController(cfg());
    c.update(3, INF, 0);
    expect(c.plan).toEqual({ settledEnd: 0, activeEnd: 3 });
    // 0 + stagger*(3-1) + duration
    expect(c.nextWakeup).toBe(40 * 2 + 150);
    expect(c.isAnimating).toBe(true);
  });

  it("holds new content as pending until the active chunk completes", () => {
    const c = new AnimationController(cfg());
    c.update(3, INF, 0);
    c.update(5, INF, 10); // before completion
    expect(c.plan).toEqual({ settledEnd: 0, activeEnd: 3 });
  });

  it("folds the active chunk into settled and starts the next on completion", () => {
    const c = new AnimationController(cfg());
    c.update(3, INF, 0);
    const done = c.nextWakeup as number; // 230
    c.update(5, INF, done);
    expect(c.plan).toEqual({ settledEnd: 3, activeEnd: 5 });
    expect(c.nextWakeup).toBe(done + 40 * 1 + 150);
  });

  it("drains to idle when fully caught up", () => {
    const c = new AnimationController(cfg());
    c.update(3, INF, 0);
    const t1 = c.nextWakeup as number;
    c.update(3, INF, t1);
    const t2 = c.nextWakeup as number;
    c.update(3, INF, t2);
    expect(c.plan).toEqual({ settledEnd: 3, activeEnd: 3 });
    expect(c.nextWakeup).toBeNull();
    expect(c.isAnimating).toBe(false);
  });

  it("never animates past the gate", () => {
    const c = new AnimationController(cfg());
    c.update(5, 3, 0); // 5 total but gated at 3
    expect(c.plan).toEqual({ settledEnd: 0, activeEnd: 3 });
    const done = c.nextWakeup as number;
    c.update(5, 5, done); // gate lifts
    expect(c.plan).toEqual({ settledEnd: 3, activeEnd: 5 });
  });

  it("coalesces the backlog and snaps overflow beyond the cap to settled", () => {
    const c = new AnimationController(cfg({ coalesceCap: 2 }));
    c.update(10, INF, 0);
    // oldest 8 snap to settled, last 2 animate
    expect(c.plan).toEqual({ settledEnd: 8, activeEnd: 10 });
  });

  it("animates each segment promptly under a slow trickle", () => {
    const c = new AnimationController(cfg());
    c.update(1, INF, 0);
    expect(c.plan).toEqual({ settledEnd: 0, activeEnd: 1 });
    const done = c.nextWakeup as number; // 0 + 0 + 150
    expect(done).toBe(150);
    c.update(2, INF, done);
    expect(c.plan).toEqual({ settledEnd: 1, activeEnd: 2 });
  });

  it("clamps frontiers when the segment count transiently shrinks", () => {
    const c = new AnimationController(cfg());
    c.update(5, INF, 0); // active [0,5]
    const done = c.nextWakeup as number;
    c.update(5, INF, done); // settled 5
    c.update(2, INF, done + 1); // content shrank to 2
    expect(c.plan.settledEnd).toBeLessThanOrEqual(2);
    expect(c.plan.activeEnd).toBeLessThanOrEqual(2);
    expect(c.plan.activeEnd).toBeGreaterThanOrEqual(c.plan.settledEnd);
  });
});
