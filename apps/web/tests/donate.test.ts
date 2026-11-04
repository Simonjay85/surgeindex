import { describe, expect, it } from "vitest";
import { DONATE_NOTE, getDonateConfig, vietQrUrl } from "../lib/donate";

describe("donate config", () => {
  it("is disabled (Sắp ra mắt) when no env var is set", () => {
    expect(getDonateConfig({})).toEqual({ bank: null, momoPhone: null, intlUrl: null, enabled: false });
  });

  it("builds a VietQR image URL from the bank BIN or code with the transfer note", () => {
    const cfg = getDonateConfig({ DONATE_BANK_BIN: "970436", DONATE_ACCOUNT_NO: "0123 456 789", DONATE_ACCOUNT_NAME: "Nguyen Van A" });
    expect(cfg.enabled).toBe(true);
    expect(cfg.bank?.accountNo).toBe("0123456789");
    expect(cfg.bank?.qrUrl).toBe("https://img.vietqr.io/image/970436-0123456789-compact2.png?addInfo=UNG+HO+SURGEINDEX&accountName=NGUYEN+VAN+A");
    expect(getDonateConfig({ DONATE_BANK_CODE: "VCB", DONATE_ACCOUNT_NO: "1", DONATE_ACCOUNT_NAME: "A" }).bank).toBeNull(); // account too short
    expect(getDonateConfig({ DONATE_BANK_CODE: "VCB", DONATE_ACCOUNT_NO: "9988776655", DONATE_ACCOUNT_NAME: "A" }).bank?.bank).toBe("VCB");
    expect(vietQrUrl("970436", "1", "A")).toContain(`addInfo=${DONATE_NOTE.replace(/ /g, "+")}`);
  });

  it("needs every bank field, accepts MoMo-only or https-only international links", () => {
    expect(getDonateConfig({ DONATE_BANK_BIN: "970436", DONATE_ACCOUNT_NO: "0123456789" }).enabled).toBe(false);
    expect(getDonateConfig({ DONATE_MOMO_PHONE: "0901 234 567" }).momoPhone).toBe("0901234567");
    expect(getDonateConfig({ DONATE_INTL_URL: "http://ko-fi.com/x" }).intlUrl).toBeNull();
    expect(getDonateConfig({ DONATE_INTL_URL: "https://ko-fi.com/surgeindex" })).toMatchObject({ intlUrl: "https://ko-fi.com/surgeindex", enabled: true });
  });
});
