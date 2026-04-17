import { createServer } from './server.js';

export function main(args: string[]) {
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.split('=')[1]) : 4801;
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`gen-spec-proxy listening on http://127.0.0.1:${port}`);
  });
}
