"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies a ready caption to the clipboard (falls back to selecting the text). */
export function CopyCaption({ text, id, labels = { copy: "Chép caption", copied: "Đã chép caption" } }: { text: string; id: string; labels?: { copy: string; copied: string } }) {
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
      {copied ? labels.copied : labels.copy}
    </button>
  );
}
