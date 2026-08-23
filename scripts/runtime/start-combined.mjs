// CloudBase Run hosts only the stateless API. Media processing is dispatched
// to the aivoice-worker event function and never runs as a resident process.
await import('../../apps/api/dist/main.js');
