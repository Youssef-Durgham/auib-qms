type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

class SSEManager {
  private clients: SSEClient[] = [];

  addClient(controller: ReadableStreamDefaultController): string {
    const id = Math.random().toString(36).substring(7);
    this.clients.push({ id, controller });
    return id;
  }

  removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
  }

  broadcast(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    this.clients.forEach((client) => {
      try {
        client.controller.enqueue(encoder.encode(message));
      } catch {
        this.removeClient(client.id);
      }
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var sseManager: SSEManager | undefined;
}

export const sseManager = global.sseManager || new SSEManager();
if (!global.sseManager) {
  global.sseManager = sseManager;
}
