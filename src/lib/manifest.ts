// The manifest registry. Every system's behavior — shape, scoring, map, Learn
// tabs, attribute validation — is data interpreted by generic engines. This is
// the single schema that gates what may enter systems.manifest: an invalid
// manifest fails at import time, never at request time.
import { z } from "zod";

export const manifestSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    category: z.enum(["transport", "nature", "admin", "culture"]),
    geometryType: z.enum(["line", "polygon", "point"]),
    hierarchy: z
      .array(
        z.object({
          kind: z.string().min(1),
          role: z.enum(["container", "leaf"]),
          container: z.string().optional(), // kind of the containing level
        })
      )
      .min(1),
    completion: z.object({
      rule: z.enum(["count", "weighted", "container_rollup"]),
      weightField: z.string().optional(), // components.attrs key the weight was derived from
      unit: z.string().optional(), // display unit for weighted rules, e.g. "mi"
      groupBy: z.enum(["container"]).optional(), // also surface per-container progress
    }),
    learnTabs: z.array(z.string().min(1)).min(1),
    attributesSchema: z.record(z.string(), z.unknown()).optional(), // JSON Schema for components.attrs
    map: z.object({
      pmtilesUrl: z.string(),
      sourceLayer: z.string(),
      layers: z
        .array(
          z.object({
            type: z.enum(["line", "fill", "circle", "symbol"]),
            paint: z.record(z.string(), z.unknown()).optional(),
            layout: z.record(z.string(), z.unknown()).optional(),
            minzoom: z.number().optional(),
            maxzoom: z.number().optional(),
          })
        )
        .min(1),
      colors: z
        .object({
          done: z.string(),
          missing: z.string(),
          wishlist: z.string().optional(),
        })
        .optional(),
      center: z.tuple([z.number(), z.number()]).optional(),
      zoom: z.number().optional(),
    }),
    badges: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.completion.rule === "weighted" && !m.completion.weightField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completion", "weightField"],
        message: "completion.rule 'weighted' requires completion.weightField",
      });
    }
    const kinds = new Set(m.hierarchy.map((h) => h.kind));
    for (const [i, level] of m.hierarchy.entries()) {
      if (level.container && !kinds.has(level.container)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hierarchy", i, "container"],
          message: `container kind '${level.container}' is not a declared hierarchy kind`,
        });
      }
    }
    if (!m.hierarchy.some((h) => h.role === "leaf")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hierarchy"],
        message: "hierarchy must declare at least one leaf level",
      });
    }
  });

export type SystemManifest = z.infer<typeof manifestSchema>;

export function validateManifest(input: unknown): SystemManifest {
  return manifestSchema.parse(input);
}

export const DEFAULT_MAP_COLORS = {
  done: "#10b981",
  missing: "#94a3b8",
  wishlist: "#f59e0b",
};

// Minimal JSON-Schema checker for components.attrs at import time. Supports the
// subset manifests actually use (type/properties/required/items). Anything the
// checker does not understand is permitted rather than rejected.
export function validateAttrs(
  schema: Record<string, unknown> | undefined,
  attrs: unknown,
  path = "attrs"
): string[] {
  if (!schema) return [];
  const errors: string[] = [];
  const type = schema.type as string | undefined;
  const typeOk = (t: string, v: unknown) =>
    t === "object"
      ? typeof v === "object" && v !== null && !Array.isArray(v)
      : t === "array"
        ? Array.isArray(v)
        : t === "integer"
          ? typeof v === "number" && Number.isInteger(v)
          : typeof v === t;
  if (type && !typeOk(type, attrs)) {
    errors.push(`${path}: expected ${type}`);
    return errors;
  }
  if (type === "object") {
    const obj = attrs as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required`);
    }
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, sub] of Object.entries(props)) {
      // undefined values are dropped by JSON serialization, so not "present"
      if (obj[key] !== undefined) errors.push(...validateAttrs(sub, obj[key], `${path}.${key}`));
    }
  }
  if (type === "array" && schema.items) {
    (attrs as unknown[]).forEach((v, i) =>
      errors.push(...validateAttrs(schema.items as Record<string, unknown>, v, `${path}[${i}]`))
    );
  }
  return errors;
}
