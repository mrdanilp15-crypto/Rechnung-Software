import { describe, it, expect } from "vitest";
import { libpqUrl } from "../src/utils/dbUrl";

describe("libpqUrl", () => {
  it("entfernt den Prisma-Parameter schema, den pg_dump nicht kennt", () => {
    expect(libpqUrl("postgresql://u:p@db:5432/rechnung?schema=public")).toBe("postgresql://u:p@db:5432/rechnung");
  });
  it("behält andere Parameter und Sonderzeichen im Passwort", () => {
    expect(libpqUrl("postgresql://u:p%40ss@db:5432/r?schema=public&sslmode=require")).toBe("postgresql://u:p%40ss@db:5432/r?sslmode=require");
  });
  it("lässt URLs ohne Parameter unverändert", () => {
    expect(libpqUrl("postgresql://u:p@db:5432/r")).toBe("postgresql://u:p@db:5432/r");
  });
});
