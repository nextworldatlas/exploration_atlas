import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Content hash of the committed tile archives. The map appends it to tile URLs
// so a rebuilt archive never mixes with byte ranges a browser cached from the
// previous one (the tile route lets browsers cache for a day).
function tilesVersion(): string {
  const dir = path.join(process.cwd(), "public", "tiles");
  const hash = createHash("sha256");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".pmtiles")).sort()) {
    hash.update(f).update(readFileSync(path.join(dir, f)));
  }
  return hash.digest("hex").slice(0, 12);
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_TILES_VERSION: tilesVersion() },
};

export default nextConfig;
