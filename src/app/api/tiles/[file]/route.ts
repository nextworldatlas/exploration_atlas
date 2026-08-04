import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";

export const dynamic = "force-dynamic";

// PMTiles archives are read by the client with HTTP Range requests — the whole
// point is fetching a few KB of a multi-MB archive per view. Static hosting in
// front of the app ignores Range and returns the entire file with 200, which
// breaks the protocol, so the app serves these itself.
const TILES_DIR = path.join(process.cwd(), "public", "tiles");
const FILENAME = /^[a-z0-9-]+\.pmtiles$/; // also blocks path traversal

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!FILENAME.test(file)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(TILES_DIR, file);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
    // archives are rebuilt under a new deploy, so they can cache hard
    "Cache-Control": "public, max-age=86400",
  };

  const range = req.headers.get("range");
  if (!range) {
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) {
    return new Response("Invalid range", {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  // "bytes=-N" means the final N bytes; otherwise start[-end], end inclusive.
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }

  if (start > end || start >= size) {
    return new Response("Range not satisfiable", {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
  return new Response(stream, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
