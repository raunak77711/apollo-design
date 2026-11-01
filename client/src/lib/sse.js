/**
 * Read a server-sent-events response body.
 *
 * `EventSource` can only GET, and the board endpoints carry the whole brief in a
 * POST body, so streams arrive over `fetch`. Events are separated by a blank
 * line; whatever trails the last one is a partial frame and waits for the next
 * read (or is flushed when the stream ends).
 */
export async function readEventStream(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (frame) => {
    const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
    const raw = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!event || !raw) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    onEvent(event, data);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      frames.forEach(handle);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handle(buffer);
  } finally {
    reader.cancel().catch(() => {});
  }
}
