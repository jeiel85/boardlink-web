export const PROTOCOL_VERSION = '1.0.0';
export { BUILD_ID } from './build-info.js';
export { PROTOCOL_WIRE_VERSION } from './envelope.js';
export type { ProtocolEnvelope, ProtocolEnvelopeBase } from './envelope.js';
export { ProtocolEnvelopeBaseSchema } from './envelope.js';
export * from './messages.js';
export { canonicalJson, computeStateHash } from './state-hash.js';
export type {
  GameMetadata,
  GamePlayer,
  GameActor,
  GameViewer,
  CommandValidation,
  GameModule,
  AnyGameModule,
} from './game-sdk.js';
