"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";

const plugins = { cjk, code, math, mermaid };

export function AIMessage({ children }: { children: string }) {
  return <Streamdown plugins={plugins}>{children}</Streamdown>;
}
