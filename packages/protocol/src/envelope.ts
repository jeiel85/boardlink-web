import { z } from 'zod';

export const PROTOCOL_WIRE_VERSION = 1 as const;

export const ProtocolEnvelopeBaseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_WIRE_VERSION),
  messageId: z.string().min(1).max(64),
  messageType: z.string().min(1).max(64),
  roomId: z.string().min(1).max(32).optional(),
  matchId: z.string().min(1).max(64).optional(),
  senderPublicId: z.string().min(1).max(64).optional(),
  clientSequence: z.number().int().nonnegative().optional(),
  serverSequence: z.number().int().nonnegative().optional(),
  sentAtClientMs: z.number().int().nonnegative().optional(),
  sentAtServerMs: z.number().int().nonnegative().optional(),
  acknowledgement: z.number().int().nonnegative().optional(),
  payload: z.unknown(),
});

export type ProtocolEnvelopeBase = z.infer<typeof ProtocolEnvelopeBaseSchema>;

export interface ProtocolEnvelope<TType extends string, TPayload> {
  protocolVersion: typeof PROTOCOL_WIRE_VERSION;
  messageId: string;
  messageType: TType;
  roomId?: string;
  matchId?: string;
  senderPublicId?: string;
  clientSequence?: number;
  serverSequence?: number;
  sentAtClientMs?: number;
  sentAtServerMs?: number;
  acknowledgement?: number;
  payload: TPayload;
}
