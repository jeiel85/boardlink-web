import { z } from 'zod';
import type { ProtocolEnvelope, ProtocolEnvelopeBase } from './envelope.js';
import { ProtocolEnvelopeBaseSchema } from './envelope.js';

// --- Shared room/match domain types (wire-level DTOs) ---

export const RoomPhaseSchema = z.enum([
  'LOBBY',
  'CONFIGURING',
  'READY_CHECK',
  'STARTING',
  'IN_MATCH',
  'PAUSED',
  'COMPLETED',
  'CLOSED',
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const MemberStatusSchema = z.enum([
  'INVITED',
  'JOINING',
  'CONNECTED',
  'READY',
  'PLAYING',
  'DISCONNECTED',
  'RECONNECTING',
  'LEFT',
]);
export type MemberStatus = z.infer<typeof MemberStatusSchema>;

export const RoomMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  status: MemberStatusSchema,
  isOwner: z.boolean(),
  seatIndex: z.number().int().nonnegative().optional(),
});
export type RoomMember = z.infer<typeof RoomMemberSchema>;

// --- Connection payload schemas ---

export const ClientHelloPayloadSchema = z.object({
  sessionToken: z.string(),
  appVersion: z.string(),
  buildId: z.string(),
  protocolVersion: z.string(),
  gameModuleVersions: z.record(z.string()),
  capabilityFlags: z.array(z.string()),
});
export type ClientHelloPayload = z.infer<typeof ClientHelloPayloadSchema>;

export const SessionAcceptedPayloadSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type SessionAcceptedPayload = z.infer<typeof SessionAcceptedPayloadSchema>;

export const SessionRejectedPayloadSchema = z.object({
  reason: z.string(),
  message: z.string(),
});
export type SessionRejectedPayload = z.infer<typeof SessionRejectedPayloadSchema>;

export const PingPayloadSchema = z.object({
  clientMs: z.number().int().nonnegative(),
});
export type PingPayload = z.infer<typeof PingPayloadSchema>;

export const PongPayloadSchema = z.object({
  clientMs: z.number().int().nonnegative(),
  serverMs: z.number().int().nonnegative(),
});
export type PongPayload = z.infer<typeof PongPayloadSchema>;

export const ErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

// --- Room payload schemas ---

export const RoomJoinPayloadSchema = z.object({
  roomCode: z.string().min(1).max(16),
  resumeToken: z.string().optional(),
  lastAppliedServerSequence: z.number().int().nonnegative().optional(),
  lastStateHash: z.string().optional(),
});
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;

export const RoomJoinedPayloadSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  phase: RoomPhaseSchema,
  ownerId: z.string(),
  members: z.array(RoomMemberSchema),
  config: z.record(z.unknown()),
  matchId: z.string().optional(),
  resumeToken: z.string(),
  serverSequence: z.number().int().nonnegative(),
  serverMs: z.number().int().nonnegative(),
});
export type RoomJoinedPayload = z.infer<typeof RoomJoinedPayloadSchema>;

export const RoomLeavePayloadSchema = z.object({});
export type RoomLeavePayload = z.infer<typeof RoomLeavePayloadSchema>;

export const RoomMemberJoinedPayloadSchema = z.object({
  member: RoomMemberSchema,
  serverMs: z.number().int().nonnegative(),
});
export type RoomMemberJoinedPayload = z.infer<typeof RoomMemberJoinedPayloadSchema>;

export const RoomMemberLeftPayloadSchema = z.object({
  userId: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type RoomMemberLeftPayload = z.infer<typeof RoomMemberLeftPayloadSchema>;

export const RoomReadySetPayloadSchema = z.object({
  ready: z.boolean(),
});
export type RoomReadySetPayload = z.infer<typeof RoomReadySetPayloadSchema>;

export const RoomConfigUpdatePayloadSchema = z.object({
  config: z.record(z.unknown()),
});
export type RoomConfigUpdatePayload = z.infer<typeof RoomConfigUpdatePayloadSchema>;

export const RoomSnapshotPayloadSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  phase: RoomPhaseSchema,
  ownerId: z.string(),
  members: z.array(RoomMemberSchema),
  config: z.record(z.unknown()),
  matchId: z.string().optional(),
  serverSequence: z.number().int().nonnegative(),
  stateHash: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type RoomSnapshotPayload = z.infer<typeof RoomSnapshotPayloadSchema>;

// --- Match payload schemas ---

export const MatchStartRequestPayloadSchema = z.object({
  gameId: z.string(),
});
export type MatchStartRequestPayload = z.infer<typeof MatchStartRequestPayloadSchema>;

export const MatchScheduledPayloadSchema = z.object({
  matchId: z.string(),
  startAtServerMs: z.number().int().nonnegative(),
});
export type MatchScheduledPayload = z.infer<typeof MatchScheduledPayloadSchema>;

export const MatchStartedPayloadSchema = z.object({
  matchId: z.string(),
  gameId: z.string(),
  startAtServerMs: z.number().int().nonnegative(),
  randomSeed: z.number().int(),
  initialState: z.unknown(),
  stateHash: z.string(),
  serverSequence: z.number().int().nonnegative(),
});
export type MatchStartedPayload = z.infer<typeof MatchStartedPayloadSchema>;

export const GameCommandPayloadSchema = z.object({
  matchId: z.string(),
  gamePayload: z.unknown(),
});
export type GameCommandPayload = z.infer<typeof GameCommandPayloadSchema>;

export const GameEventPayloadSchema = z.object({
  eventId: z.string(),
  matchId: z.string(),
  eventType: z.string(),
  gamePayload: z.unknown(),
  stateHash: z.string().optional(),
  serverMs: z.number().int().nonnegative(),
});
export type GameEventPayload = z.infer<typeof GameEventPayloadSchema>;

export const StateHashPayloadSchema = z.object({
  matchId: z.string(),
  serverSequence: z.number().int().nonnegative(),
  hash: z.string(),
});
export type StateHashPayload = z.infer<typeof StateHashPayloadSchema>;

export const ResyncRequestPayloadSchema = z.object({
  matchId: z.string(),
  lastAppliedServerSequence: z.number().int().nonnegative(),
  lastStateHash: z.string(),
});
export type ResyncRequestPayload = z.infer<typeof ResyncRequestPayloadSchema>;

export const StateSnapshotPayloadSchema = z.object({
  matchId: z.string(),
  serverSequence: z.number().int().nonnegative(),
  state: z.unknown(),
  stateHash: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type StateSnapshotPayload = z.infer<typeof StateSnapshotPayloadSchema>;

export const MatchPausedPayloadSchema = z.object({
  matchId: z.string(),
  reason: z.string().optional(),
  serverMs: z.number().int().nonnegative(),
});
export type MatchPausedPayload = z.infer<typeof MatchPausedPayloadSchema>;

export const MatchResumedPayloadSchema = z.object({
  matchId: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type MatchResumedPayload = z.infer<typeof MatchResumedPayloadSchema>;

export const MatchCompletedPayloadSchema = z.object({
  matchId: z.string(),
  result: z.unknown(),
  finalStateHash: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type MatchCompletedPayload = z.infer<typeof MatchCompletedPayloadSchema>;

export const MatchAbortedPayloadSchema = z.object({
  matchId: z.string(),
  reason: z.string(),
  serverMs: z.number().int().nonnegative(),
});
export type MatchAbortedPayload = z.infer<typeof MatchAbortedPayloadSchema>;

// --- Typed message envelopes ---

// Client → Server
export type ClientHelloMessage = ProtocolEnvelope<'CLIENT_HELLO', ClientHelloPayload>;
export type RoomJoinMessage = ProtocolEnvelope<'ROOM_JOIN', RoomJoinPayload>;
export type RoomLeaveMessage = ProtocolEnvelope<'ROOM_LEAVE', RoomLeavePayload>;
export type RoomReadySetMessage = ProtocolEnvelope<'ROOM_READY_SET', RoomReadySetPayload>;
export type RoomConfigUpdateMessage = ProtocolEnvelope<
  'ROOM_CONFIG_UPDATE',
  RoomConfigUpdatePayload
>;
export type MatchStartRequestMessage = ProtocolEnvelope<
  'MATCH_START_REQUEST',
  MatchStartRequestPayload
>;
export type GameCommandMessage = ProtocolEnvelope<'GAME_COMMAND', GameCommandPayload>;
export type ResyncRequestMessage = ProtocolEnvelope<'RESYNC_REQUEST', ResyncRequestPayload>;
export type PingMessage = ProtocolEnvelope<'PING', PingPayload>;

// Server → Client
export type SessionAcceptedMessage = ProtocolEnvelope<'SESSION_ACCEPTED', SessionAcceptedPayload>;
export type SessionRejectedMessage = ProtocolEnvelope<'SESSION_REJECTED', SessionRejectedPayload>;
export type RoomJoinedMessage = ProtocolEnvelope<'ROOM_JOINED', RoomJoinedPayload>;
export type RoomMemberJoinedMessage = ProtocolEnvelope<
  'ROOM_MEMBER_JOINED',
  RoomMemberJoinedPayload
>;
export type RoomMemberLeftMessage = ProtocolEnvelope<'ROOM_MEMBER_LEFT', RoomMemberLeftPayload>;
export type RoomSnapshotMessage = ProtocolEnvelope<'ROOM_SNAPSHOT', RoomSnapshotPayload>;
export type MatchScheduledMessage = ProtocolEnvelope<'MATCH_SCHEDULED', MatchScheduledPayload>;
export type MatchStartedMessage = ProtocolEnvelope<'MATCH_STARTED', MatchStartedPayload>;
export type GameEventMessage = ProtocolEnvelope<'GAME_EVENT', GameEventPayload>;
export type StateHashMessage = ProtocolEnvelope<'STATE_HASH', StateHashPayload>;
export type StateSnapshotMessage = ProtocolEnvelope<'STATE_SNAPSHOT', StateSnapshotPayload>;
export type MatchPausedMessage = ProtocolEnvelope<'MATCH_PAUSED', MatchPausedPayload>;
export type MatchResumedMessage = ProtocolEnvelope<'MATCH_RESUMED', MatchResumedPayload>;
export type MatchCompletedMessage = ProtocolEnvelope<'MATCH_COMPLETED', MatchCompletedPayload>;
export type MatchAbortedMessage = ProtocolEnvelope<'MATCH_ABORTED', MatchAbortedPayload>;
export type PongMessage = ProtocolEnvelope<'PONG', PongPayload>;
export type ErrorMessage = ProtocolEnvelope<'ERROR', ErrorPayload>;

// --- Union types ---

export type C2SMessage =
  | ClientHelloMessage
  | RoomJoinMessage
  | RoomLeaveMessage
  | RoomReadySetMessage
  | RoomConfigUpdateMessage
  | MatchStartRequestMessage
  | GameCommandMessage
  | ResyncRequestMessage
  | PingMessage;

export type S2CMessage =
  | SessionAcceptedMessage
  | SessionRejectedMessage
  | RoomJoinedMessage
  | RoomMemberJoinedMessage
  | RoomMemberLeftMessage
  | RoomSnapshotMessage
  | MatchScheduledMessage
  | MatchStartedMessage
  | GameEventMessage
  | StateHashMessage
  | StateSnapshotMessage
  | MatchPausedMessage
  | MatchResumedMessage
  | MatchCompletedMessage
  | MatchAbortedMessage
  | PongMessage
  | ErrorMessage;

// --- Parse helpers (used internally and exported for testing) ---

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

function parsePayload<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { ok: true; value: T } | { ok: false; error: string } {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.message };
}

function buildEnvelope<TType extends string, TPayload>(
  base: ProtocolEnvelopeBase,
  messageType: TType,
  payload: TPayload,
): ProtocolEnvelope<TType, TPayload> {
  return {
    protocolVersion: base.protocolVersion,
    messageId: base.messageId,
    messageType,
    roomId: base.roomId,
    matchId: base.matchId,
    senderPublicId: base.senderPublicId,
    clientSequence: base.clientSequence,
    serverSequence: base.serverSequence,
    sentAtClientMs: base.sentAtClientMs,
    sentAtServerMs: base.sentAtServerMs,
    acknowledgement: base.acknowledgement,
    payload,
  };
}

function parseBase(
  raw: string,
): { ok: true; base: ProtocolEnvelopeBase } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  const result = ProtocolEnvelopeBaseSchema.safeParse(json);
  if (!result.success) return { ok: false, error: result.error.message };
  return { ok: true, base: result.data };
}

// --- Public parse functions ---

export function parseC2SMessage(raw: string): ParseResult<C2SMessage> {
  const baseResult = parseBase(raw);
  if (!baseResult.ok) return baseResult;
  const { base } = baseResult;

  switch (base.messageType) {
    case 'CLIENT_HELLO': {
      const r = parsePayload(ClientHelloPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'CLIENT_HELLO', r.value) };
    }
    case 'ROOM_JOIN': {
      const r = parsePayload(RoomJoinPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_JOIN', r.value) };
    }
    case 'ROOM_LEAVE': {
      const r = parsePayload(RoomLeavePayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_LEAVE', r.value) };
    }
    case 'ROOM_READY_SET': {
      const r = parsePayload(RoomReadySetPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_READY_SET', r.value) };
    }
    case 'ROOM_CONFIG_UPDATE': {
      const r = parsePayload(RoomConfigUpdatePayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_CONFIG_UPDATE', r.value) };
    }
    case 'MATCH_START_REQUEST': {
      const r = parsePayload(MatchStartRequestPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_START_REQUEST', r.value) };
    }
    case 'GAME_COMMAND': {
      const r = parsePayload(GameCommandPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'GAME_COMMAND', r.value) };
    }
    case 'RESYNC_REQUEST': {
      const r = parsePayload(ResyncRequestPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'RESYNC_REQUEST', r.value) };
    }
    case 'PING': {
      const r = parsePayload(PingPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'PING', r.value) };
    }
    default:
      return { ok: false, error: `Unknown C2S messageType: ${base.messageType}` };
  }
}

export function parseS2CMessage(raw: string): ParseResult<S2CMessage> {
  const baseResult = parseBase(raw);
  if (!baseResult.ok) return baseResult;
  const { base } = baseResult;

  switch (base.messageType) {
    case 'SESSION_ACCEPTED': {
      const r = parsePayload(SessionAcceptedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'SESSION_ACCEPTED', r.value) };
    }
    case 'SESSION_REJECTED': {
      const r = parsePayload(SessionRejectedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'SESSION_REJECTED', r.value) };
    }
    case 'ROOM_JOINED': {
      const r = parsePayload(RoomJoinedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_JOINED', r.value) };
    }
    case 'ROOM_MEMBER_JOINED': {
      const r = parsePayload(RoomMemberJoinedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_MEMBER_JOINED', r.value) };
    }
    case 'ROOM_MEMBER_LEFT': {
      const r = parsePayload(RoomMemberLeftPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_MEMBER_LEFT', r.value) };
    }
    case 'ROOM_SNAPSHOT': {
      const r = parsePayload(RoomSnapshotPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ROOM_SNAPSHOT', r.value) };
    }
    case 'MATCH_SCHEDULED': {
      const r = parsePayload(MatchScheduledPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_SCHEDULED', r.value) };
    }
    case 'MATCH_STARTED': {
      const r = parsePayload(MatchStartedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_STARTED', r.value) };
    }
    case 'GAME_EVENT': {
      const r = parsePayload(GameEventPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'GAME_EVENT', r.value) };
    }
    case 'STATE_HASH': {
      const r = parsePayload(StateHashPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'STATE_HASH', r.value) };
    }
    case 'STATE_SNAPSHOT': {
      const r = parsePayload(StateSnapshotPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'STATE_SNAPSHOT', r.value) };
    }
    case 'MATCH_PAUSED': {
      const r = parsePayload(MatchPausedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_PAUSED', r.value) };
    }
    case 'MATCH_RESUMED': {
      const r = parsePayload(MatchResumedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_RESUMED', r.value) };
    }
    case 'MATCH_COMPLETED': {
      const r = parsePayload(MatchCompletedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_COMPLETED', r.value) };
    }
    case 'MATCH_ABORTED': {
      const r = parsePayload(MatchAbortedPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'MATCH_ABORTED', r.value) };
    }
    case 'PONG': {
      const r = parsePayload(PongPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'PONG', r.value) };
    }
    case 'ERROR': {
      const r = parsePayload(ErrorPayloadSchema, base.payload);
      if (!r.ok) return r;
      return { ok: true, message: buildEnvelope(base, 'ERROR', r.value) };
    }
    default:
      return { ok: false, error: `Unknown S2C messageType: ${base.messageType}` };
  }
}
