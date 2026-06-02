import { useEffect, useRef, useState } from "react";
import type { Options } from "../markdown";
import { AnimationController } from "./controller";
import {
  type BlockSegmentCounter,
  createBlockSegmentCounter,
} from "./segment-counter";
import type { AnimateConfig, AnimationPlan } from "./transform";

/** Max segments animated in one chunk; older backlog snaps to settled. */
const COALESCE_CAP = 24;

const monotonicNow = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

export interface BlockAnimation {
  baseOrdinal: number;
  /** Effective plan in GLOBAL ordinals — clamped/frozen for settled blocks. */
  plan: AnimationPlan;
}

const IDLE: BlockAnimation = {
  baseOrdinal: 0,
  plan: { settledEnd: 0, activeEnd: 0 },
};

/**
 * Owns the animation scheduler for a Streamdown instance. Counts each block's
 * segments (cached per block string), drives the {@link AnimationController},
 * and returns the per-block effective plan. Settled blocks get a frozen plan so
 * React's memo skips them — only the animating tail re-renders each tick.
 */
export function useAnimation(params: {
  blocks: string[];
  config: AnimateConfig | null;
  /** While true the controller drives a streaming animation; when false the
   *  content is finalized (everything settled/visible) without tearing the
   *  plugin out of the pipeline. */
  isAnimating: boolean;
  countingOptions: Readonly<Omit<Options, "children">>;
  /** Highest global ordinal eligible to animate (atomic completeness gate). */
  gateAt?: number;
}): BlockAnimation[] {
  const { blocks, config, isAnimating, countingOptions, gateAt } = params;

  const controllerRef = useRef<AnimationController | null>(null);
  const counterRef = useRef<BlockSegmentCounter | null>(null);
  const configRef = useRef<AnimateConfig | null | undefined>(undefined);
  const hasAnimatedRef = useRef(false);
  // Latches the wall-clock time used to step the controller so re-renders that
  // don't represent a new tick reuse it, keeping `controller.update` idempotent
  // under StrictMode double-invokes and discarded/restarted concurrent renders
  // (Streamdown drives block updates through startTransition). Reading a fresh
  // performance.now() on every render would otherwise advance the controller
  // with diverging times and snap the cascade instead of fading it in.
  const tickRef = useRef({ total: -1, gate: -1, wake: -1, now: 0 });
  const [wake, forceWake] = useState(0);

  if (isAnimating) {
    hasAnimatedRef.current = true;
  }

  // `config` is memoized by the caller, so its identity is stable until it
  // actually changes — no need to serialize it each render to detect that.
  if (configRef.current !== config) {
    configRef.current = config;
    if (config) {
      controllerRef.current = new AnimationController({
        duration: config.duration,
        stagger: config.stagger,
        coalesceCap: COALESCE_CAP,
      });
      counterRef.current = createBlockSegmentCounter(countingOptions, config);
    } else {
      controllerRef.current = null;
      counterRef.current = null;
    }
    // Force a fresh `now` on the next step so a newly-built controller starts
    // its first chunk from the current time, not a stale latched value.
    tickRef.current = { total: -1, gate: -1, wake: -1, now: 0 };
  }

  const controller = controllerRef.current;
  const counter = counterRef.current;

  let perBlock: BlockAnimation[];
  let wakeup: number | null = null;

  if (config && controller && counter) {
    const counts = blocks.map((block) => counter.count(block));
    const baseOrdinals: number[] = [];
    let acc = 0;
    for (const count of counts) {
      baseOrdinals.push(acc);
      acc += count;
    }
    const total = acc;

    if (isAnimating || hasAnimatedRef.current) {
      // Streaming, or draining the backlog after the stream ended. Keep driving
      // the controller from the (re)scheduled timer below until everything is
      // settled — stable keys make this drain reconcile in place, so the tail
      // animates to completion instead of snapping.
      const gate = gateAt ?? total;
      const t = tickRef.current;
      let now: number;
      if (t.total === total && t.gate === gate && t.wake === wake) {
        now = t.now;
      } else {
        now = monotonicNow();
        tickRef.current = { total, gate, wake, now };
      }
      controller.update(total, gate, now);
      wakeup = controller.nextWakeup;
      const { plan } = controller;
      perBlock = blocks.map((_block, i) => {
        const base = baseOrdinals[i];
        const end = base + counts[i];
        if (plan.settledEnd >= end) {
          return {
            baseOrdinal: base,
            plan: { settledEnd: end, activeEnd: end },
          };
        }
        return { baseOrdinal: base, plan };
      });
    } else {
      // Never streamed (historical / static render): show everything settled
      // immediately, with no animation.
      const settled: AnimationPlan = { settledEnd: total, activeEnd: total };
      perBlock = blocks.map((_block, i) => ({
        baseOrdinal: baseOrdinals[i],
        plan: settled,
      }));
    }
  } else {
    perBlock = blocks.map(() => IDLE);
  }

  // Only (re)schedule when the next completion time actually changes, so the
  // timer isn't cleared-and-reset on every streaming render (which would stop
  // it from ever firing and leave the final chunk un-animated).
  useEffect(() => {
    if (wakeup === null) {
      return;
    }
    const delay = Math.max(0, wakeup - monotonicNow()) + 1;
    const timer = setTimeout(() => forceWake((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [wakeup]);

  return perBlock;
}
