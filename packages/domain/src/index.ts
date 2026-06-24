// Branded Types for IDs
export type RoomId = string & { readonly __brand: unique symbol };
export type UserId = string & { readonly __brand: unique symbol };
export type SessionId = string & { readonly __brand: unique symbol };

export function RoomId(val: string): RoomId {
  return val as RoomId;
}

export function UserId(val: string): UserId {
  return val as UserId;
}

export function SessionId(val: string): SessionId {
  return val as SessionId;
}

// Structured Error Model
export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class BoardLinkError extends Error implements AppError {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BoardLinkError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, BoardLinkError.prototype);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// Result Type Helper
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// User Profile interfaces
export interface UserProfile {
  publicId: UserId;
  displayName: string;
}

// Localized Display Name Generator
export function generateDisplayName(locale: string, seed?: number): string {
  const isKo = locale.startsWith('ko');
  const adjectives = isKo
    ? [
        '날쌘',
        '똑똑한',
        '빠른',
        '조용한',
        '밝은',
        '상냥한',
        '황금빛',
        '밤하늘의',
        '야생의',
        '서리내린',
      ]
    : [
        'Sleek',
        'Clever',
        'Swift',
        'Quiet',
        'Bright',
        'Gentle',
        'Golden',
        'Midnight',
        'Wild',
        'Frosty',
      ];
  const nouns = isKo
    ? ['판다', '여우', '수달', '코알라', '매', '올빼미', '오소리', '돌고래', '치타', '여우원숭이']
    : ['Panda', 'Fox', 'Otter', 'Koala', 'Falcon', 'Owl', 'Badger', 'Dolphin', 'Cheetah', 'Lemur'];

  let adjIdx = 0;
  let nounIdx = 0;

  if (seed !== undefined) {
    adjIdx = Math.abs(Math.floor(seed)) % adjectives.length;
    nounIdx = Math.abs(Math.floor(seed * 31)) % nouns.length;
  } else {
    adjIdx = Math.floor(Math.random() * adjectives.length);
    nounIdx = Math.floor(Math.random() * nouns.length);
  }

  return `${adjectives[adjIdx]} ${nouns[nounIdx]}`;
}
