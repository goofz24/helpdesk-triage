import { describe, expect, it } from "vitest";
import { policyReasons, unsafeReplyProblems } from "../src/policy";
import { goodTriage } from "./helpers";

describe("unsafe reply check", () => {
  it("catches requests for secrets in English and Spanish", () => {
    expect(unsafeReplyProblems("Please send us your password so we can check.")).toContain("asks the user for a password or code");
    expect(unsafeReplyProblems("Envíanos tu contraseña para revisarla.")).toContain("asks the user for a password or code");
    expect(unsafeReplyProblems("Reply with the verification code you received.")).toHaveLength(1);
  });
  it("catches claims that work was already done", () => {
    expect(unsafeReplyProblems("I've reset your password.")).toContain("says an action was already done");
    expect(unsafeReplyProblems("Ya te hemos dado acceso a la carpeta.")).toContain("says an action was already done");
  });
  it("catches password-like strings", () => {
    expect(unsafeReplyProblems("Your temporary password is Welcome#2026")).toContain("contains something that looks like a password");
  });
  it("accepts a normal reply", () => {
    expect(unsafeReplyProblems("IT will never ask for your password. A technician will call you to verify your identity.")).toEqual([]);
    expect(unsafeReplyProblems("Un técnico te llamará para verificar tu identidad. Nunca compartas tu contraseña.")).toEqual([]);
  });
});

describe("policy rules", () => {
  it("adds no reasons for a plain self-help ticket", () => {
    expect(policyReasons(goodTriage, 4, [])).toEqual([]);
  });
  it("always sends security and access tickets to a person", () => {
    expect(policyReasons({ ...goodTriage, category: "security" }, 4, [])).toContain("policy_security_category");
    expect(policyReasons({ ...goodTriage, category: "access_request" }, 5, [])).toContain("policy_access_change");
  });
  it("flags P1/P2, low confidence, suspicious text, other languages and missing KB", () => {
    expect(policyReasons(goodTriage, 2, [])).toContain("policy_high_priority");
    expect(policyReasons({ ...goodTriage, confidence: "low" }, 4, [])).toContain("policy_low_confidence");
    expect(policyReasons({ ...goodTriage, suspicious_instructions: true }, 4, [])).toContain("policy_suspicious_instructions");
    expect(policyReasons({ ...goodTriage, language: "other" }, 4, [])).toContain("policy_language_not_supported");
    expect(policyReasons({ ...goodTriage, kb_article: "none" }, 4, [])).toContain("policy_no_kb_article");
  });
  it("forces a person when a secret was pasted or the reply is unsafe", () => {
    expect(policyReasons(goodTriage, 4, ["password"])).toContain("policy_secret_in_ticket");
    expect(policyReasons({ ...goodTriage, draft_reply: "I have unlocked your account." }, 4, [])).toContain("policy_unsafe_reply");
  });
});
