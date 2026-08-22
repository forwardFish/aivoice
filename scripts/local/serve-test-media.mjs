import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.cwd(), '.runtime/backend-e2e');
const port = Number(process.env.AIVOICE_TEST_MEDIA_PORT || 8790);

http.createServer((request, response) => {
  const name = path.basename(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  const file = path.join(root, name);
  if (!name || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`test media server ready on http://127.0.0.1:${port}`);
});
