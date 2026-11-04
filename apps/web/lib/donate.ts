/**
 * "Ủng hộ SurgeIndex" — donation channels, configured only through env vars.
 * Nothing is hard-coded: with no env set, the page says "Sắp ra mắt" and the
 * footer / story links stay hidden.
 *
 *   DONATE_BANK_BIN or DONATE_BANK_CODE  VietQR bank (BIN like 970436, or code like VCB)
 *   DONATE_ACCOUNT_NO, DONATE_ACCOUNT_NAME
 *   DONATE_BANK_NAME   optional display name of the bank
 *   DONATE_MOMO_PHONE  optional MoMo number
 *   DONATE_INTL_URL    optional https link (Ko-fi, Buy Me a Coffee, …)
 */

export const DONATE_NOTE = "UNG HO SURGEINDEX";

export interface BankDonation {
  bank: string;
  bankName: string | null;
  accountNo: string;
  accountName: string;
  qrUrl: string;
}

export interface DonateConfig {
  bank: BankDonation | null;
  momoPhone: string | null;
  intlUrl: string | null;
  enabled: boolean;
}

type Env = Record<string, string | undefined>;

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** img.vietqr.io quick-link (https://www.vietqr.io/danh-sach-api/link-tao-ma-nhanh). */
export function vietQrUrl(bank: string, accountNo: string, accountName: string, note = DONATE_NOTE): string {
  const params = new URLSearchParams({ addInfo: note, accountName });
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(accountNo)}-compact2.png?${params.toString()}`;
}

export function getDonateConfig(env: Env = process.env): DonateConfig {
  const bankId = clean(env.DONATE_BANK_BIN) ?? clean(env.DONATE_BANK_CODE);
  const accountNo = clean(env.DONATE_ACCOUNT_NO)?.replace(/\s+/g, "") ?? null;
  const accountName = clean(env.DONATE_ACCOUNT_NAME);
  const validBank = bankId && /^[A-Za-z0-9]{2,12}$/.test(bankId) && accountNo && /^[0-9A-Za-z]{4,30}$/.test(accountNo) && accountName;
  const bank: BankDonation | null = validBank
    ? { bank: bankId, bankName: clean(env.DONATE_BANK_NAME), accountNo, accountName: accountName.toUpperCase(), qrUrl: vietQrUrl(bankId, accountNo, accountName.toUpperCase()) }
    : null;
  const momo = clean(env.DONATE_MOMO_PHONE)?.replace(/[\s.-]/g, "") ?? null;
  const momoPhone = momo && /^\+?[0-9]{9,12}$/.test(momo) ? momo : null;
  let intlUrl: string | null = null;
  const rawIntl = clean(env.DONATE_INTL_URL);
  if (rawIntl) {
    try {
      const u = new URL(rawIntl);
      if (u.protocol === "https:") intlUrl = u.toString();
    } catch {
      intlUrl = null;
    }
  }
  return { bank, momoPhone, intlUrl, enabled: Boolean(bank || momoPhone || intlUrl) };
}
