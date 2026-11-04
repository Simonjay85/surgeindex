import { z } from "zod";

/** "Gửi tin nóng" reader tips. Stored for manual review only — never auto-published. */

export const TIP_NOTE_MAX = 1000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const tipSchema = z
  .object({
    topic: z.string().trim().min(3, "Chủ đề cần ít nhất 3 ký tự").max(200, "Chủ đề tối đa 200 ký tự"),
    sourceUrl: z.url({ protocol: /^https?$/, message: "Link nguồn phải là địa chỉ http(s) hợp lệ" }).max(2048),
    note: optionalText(TIP_NOTE_MAX),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(320)
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.email("Email không hợp lệ").optional()),
    page: optionalText(200),
    turnstileToken: z.string().trim().max(2048).optional(),
    /** Honeypot: real visitors never fill it. */
    website: z.string().max(200).optional(),
  })
  .strict();

export type TipInput = z.infer<typeof tipSchema>;

export interface StoredTip {
  id: string;
  received_at: string;
  topic: string;
  source_url: string;
  note?: string;
  email?: string;
  page?: string;
  /** Salted hash of the client IP (never the raw address). */
  ip_hash: string;
  status: "new";
}
