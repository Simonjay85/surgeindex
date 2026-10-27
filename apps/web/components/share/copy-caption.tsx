"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies a ready caption to the clipboard (falls back to selecting the text). */
export function CopyCaption({ text, id }: { text: string; id: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById(id) as HTMLTextAreaElement | null;
      el?.select();
    }
  }
  return (
    <button type="button" className="t-share-btn" onClick={copy} aria-live="polite">
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copied ? "Đã chép caption" : "Chép caption"}
    </button>
  );
}
