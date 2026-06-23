import { sseManager } from '@/app/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET() {
  let clientId = '';
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      clientId = sseManager.addClient(controller);
      controller.enqueue(encoder.encode(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`));
      // Heartbeat: keeps the connection alive through idle periods and proxy
      // timeouts (so it doesn't silently die overnight) and gives the client a
      // liveness signal it can use to detect a dead link and reconnect.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          sseManager.removeClient(clientId);
        }
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      sseManager.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
