import { describe, expect, it } from "vitest";
import { redact } from "../src/redact";

describe("redact", () => {
  it("removes a pasted password in English", () => {
    const r = redact("My password is Summer2026! and it doesn't work");
    expect(r.text).not.toContain("Summer2026!");
    expect(r.text).toContain("[REDACTED]");
    expect(r.found).toEqual(["password"]);
  });
  it("removes a pasted password in Spanish", () => {
    const r = redact("Mi contraseña es Borinquen#2026 y no me deja entrar");
    expect(r.text).not.toContain("Borinquen#2026");
    expect(r.found).toContain("password");
  });
  it("handles 'password: x' and 'clave=x'", () => {
    expect(redact("password: Tr0ub4dor&3").text).not.toContain("Tr0ub4dor");
    expect(redact("clave=Abc12345").text).not.toContain("Abc12345");
  });
  it("leaves ordinary sentences alone", () => {
    for (const s of ["My password is not working", "la contraseña es muy larga", "Forgot my password", "password expired"]) {
      expect(redact(s)).toEqual({ text: s, found: [] });
    }
  });
  it("removes verification codes, SSNs and card numbers", () => {
    expect(redact("the code is 482913").found).toEqual(["verification_code"]);
    expect(redact("SSN 123-45-6789").text).toBe("SSN [REDACTED]");
    expect(redact("card 4111 1111 1111 1111 please").found).toEqual(["card_number"]);
  });
  it("keeps phone numbers (needed for call-backs)", () => {
    expect(redact("call me at 713-555-0144").found).toEqual([]);
  });
});
