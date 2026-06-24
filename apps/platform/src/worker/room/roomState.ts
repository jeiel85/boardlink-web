// Server-side room state types — pure TypeScript, no Cloudflare imports.
// The RoomDO owns SQL persistence; this file only provides shape definitions.

import type { RoomPhase } from '@boardlink/protocol';

export type { RoomPhase };

// MemberStatus values must match MemberStatusSchema in @boardlink/protocol
export type MemberStatus =
  | 'INVITED'
  | 'JOINING'
  | 'CONNECTED'
  | 'READY'
  | 'PLAYING'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'LEFT';

// Row shapes returned by SQLite queries in RoomDO.
// Index signature required by SqlStorageCursor<T> constraint.
export interface MemberRow {
  [key: string]: string | number | null;
  user_id: string;
  display_name: string;
  status: string;
  is_owner: number; // 0 | 1
  seat_index: number | null;
  ready: number; // 0 | 1
  resume_token: string | null;
  joined_ms: number;
}

// Wire-format member DTO built from a MemberRow
export function memberRowToDto(row: MemberRow) {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    status: row.status as MemberStatus,
    isOwner: row.is_owner === 1,
    seatIndex: row.seat_index ?? undefined,
    ready: row.ready === 1,
  };
}
