import { sseManager } from '@/app/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET() {
  let clientId = '';
  
  const stream = new ReadableStream({
    start(controller) {
      clientId = sseManager.addClient(controller);
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`));
    },
    cancel() {
      sseManager.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
