import base from './worker.js';
import { handleTickets } from './tickets.js';

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === '/api/tickets' || p.indexOf('/api/admin/tickets') === 0) return handleTickets(request, env, ctx);
    return base.fetch(request, env, ctx);
  }
};
