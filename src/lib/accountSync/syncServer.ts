import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./syncState";
import { SYNC_DOCS, type SyncDocName } from "./types";

/**
 * The server side of sync: backend-v2's `user_sync_docs` (read, RLS = own rows only) and
 * `sync_put()` (the only write, optimistic concurrency on `rev`). Only the ACCOUNTS client is
 * ever passed in (src/lib/account/client.ts) — never the legacy project's client.
 */
export interface ServerDoc {
  rev: number;
  schemaVersion: number;
  data: unknown;
}

export type ServerError = "network" | "unauthorized" | "rejected";

export type PullResult =
  | { ok: true; docs: Partial<Record<SyncDocName, ServerDoc>> }
  | { ok: false; error: ServerError };

export type PutResult =
  | { ok: true; status: "ok"; rev: number }
  /** The server has a different rev: `server` is its CURRENT copy (null when the doc does not exist). */
  | { ok: true; status: "conflict"; server: ServerDoc | null }
  | { ok: false; error: ServerError };

export interface SyncServer {
  pullAll(): Promise<PullResult>;
  put(doc: SyncDocName, data: unknown, schemaVersion: number, expectedRev: number, deviceId: string): Promise<PutResult>;
}

function errorFor(status: number | undefined): ServerError {
  if (status === 401 || status === 403) return "unauthorized";
  if (typeof status === "number" && status >= 400) return "rejected";
  return "network";
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDoc = (v: unknown): v is SyncDocName => typeof v === "string" && (SYNC_DOCS as readonly string[]).includes(v);

export function createSupabaseSyncServer(client: SupabaseClient): SyncServer {
  return {
    async pullAll() {
      try {
        const { data, error, status } = await client.from("user_sync_docs").select("doc, rev, schema_version, data");
        if (error) return { ok: false, error: errorFor(status) };
        const docs: Partial<Record<SyncDocName, ServerDoc>> = {};
        for (const row of Array.isArray(data) ? data : []) {
          // Rows the app does not understand are ignored (never treated as a deletion).
          if (!isObj(row) || !isDoc(row.doc) || !Number.isInteger(row.rev) || !Number.isInteger(row.schema_version)) continue;
          docs[row.doc] = { rev: row.rev as number, schemaVersion: row.schema_version as number, data: row.data };
        }
        return { ok: true, docs };
      } catch {
        return { ok: false, error: "network" };
      }
    },

    async put(doc, data, schemaVersion, expectedRev, deviceId) {
      try {
        const { data: rows, error, status } = await client.rpc("sync_put", {
          p_doc: doc,
          p_data: data,
          p_schema_version: schemaVersion,
          p_expected_rev: expectedRev,
          // p_device is a uuid column: anything else is sent as "unknown device" rather than failing the write.
          p_device: isUuid(deviceId) ? deviceId : null,
        });
        if (error) return { ok: false, error: errorFor(status) };
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!isObj(row)) return { ok: false, error: "rejected" };
        if (row.status === "ok" && Number.isInteger(row.rev)) return { ok: true, status: "ok", rev: row.rev as number };
        if (row.status === "conflict") {
          const server = Number.isInteger(row.rev) && Number.isInteger(row.schema_version)
            ? { rev: row.rev as number, schemaVersion: row.schema_version as number, data: row.data }
            : null;
          return { ok: true, status: "conflict", server };
        }
        return { ok: false, error: "rejected" };
      } catch {
        return { ok: false, error: "network" };
      }
    },
  };
}
