import { DurableObject } from 'cloudflare:workers';
import { Env } from '../index.js';

export class UserSessionDO extends DurableObject {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', type: 'UserSessionDO', id: this.ctx.id.toString() }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new Response(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Durable Object route not found',
        },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
