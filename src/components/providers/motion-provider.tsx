"use client";

import { MotionConfig } from "framer-motion";

/**
 * App-wide animation settings: people who turn on "reduce motion" in their OS
 * get content immediately (no fades or slides), everyone else short entrances.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
