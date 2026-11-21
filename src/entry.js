import base from './worker.js';
import { handleTickets } from './tickets.js';
import { handlePlayers } from './players.js';

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === '/api/tickets' || p.indexOf('/api/admin/tickets') === 0) return handleTickets(request, env, ctx);
    if (p === '/api/players/rename' || p === '/api/admin/player/rename') return handlePlayers(request, env);
    return base.fetch(request, env, ctx);
  }
};
