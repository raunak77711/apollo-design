import { AIProvider } from './AIProvider.js';
import { OPERATION_TYPES } from '../../design/operations.js';
import { ELEMENT_TYPES, ALLOWED_ICONS } from '../../design/schema.js';

/**
 * DeepSeek-backed provider. Uses the chat-completions API in JSON mode and asks
 * the model to return a strict { operations, message } payload. We never let the
 * model emit raw HTML/SVG — only Apollo operations, which are re-validated by the
 * operation system before anything touches a document.
 */
export class DeepSeekProvider extends AIProvider {
  constructor({ apiKey, baseUrl, model }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async generateOperations({ message, document, selectedElementId }) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt({ message, document, selectedElementId }) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DeepSeek API error ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('DeepSeek returned non-JSON content');
    }

    return {
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      message: typeof parsed.message === 'string' ? parsed.message : 'Done.',
    };
  }
}

function buildSystemPrompt() {
  return `You are Apollo, an AI design assistant. You NEVER output HTML, SVG, CSS, or code.
You modify a design ONLY by returning JSON operations.

Return a JSON object: { "operations": [...], "message": "short human summary" }.

Allowed operation types: ${OPERATION_TYPES.join(', ')}.
Allowed element types: ${ELEMENT_TYPES.join(', ')}.
Allowed icon names (use ONLY these): ${ALLOWED_ICONS.join(', ')}.

Operation shapes:
- CREATE_ELEMENT: { "type":"CREATE_ELEMENT", "element": { "type":"text|image|icon|rectangle|circle|line|button", "x":num,"y":num,"width":num,"height":num,"zIndex":num, "properties": {...} } }
  For an image element, DO NOT invent a URL. Instead set "query":"search terms" and Apollo will fetch a real photo.
- UPDATE_ELEMENT / SET_STYLE / SET_CONTENT: { "type":"UPDATE_ELEMENT", "targetId":"<id>", "changes": { ...flat props like fontSize, color, text, background, x, y } }
- MOVE_ELEMENT: { "type":"MOVE_ELEMENT", "targetId":"<id>", "changes": { "x":num, "y":num } }
- RESIZE_ELEMENT: { "type":"RESIZE_ELEMENT", "targetId":"<id>", "changes": { "width":num, "height":num } }
- DELETE_ELEMENT / DUPLICATE_ELEMENT: { "type":"...", "targetId":"<id>" }
- ADD_ICON: { "type":"ADD_ICON", "name":"Dumbbell", "x":num, "y":num, "size":num, "color":"#fff" }
- SET_CANVAS: { "type":"SET_CANVAS", "changes": { "background":"#hex" } }

Rules:
- Make the SMALLEST change necessary. To edit, use UPDATE/MOVE/RESIZE on existing targetId; do NOT recreate the design.
- Coordinates are in canvas pixels. Keep elements inside the canvas bounds.
- Text properties: text, fontSize, fontWeight (100-900), color (#hex), align, lineHeight, letterSpacing.
- Button properties: text, background, color, fontSize, fontWeight, borderRadius.
- Respond with valid JSON only.`;
}

function buildUserPrompt({ message, document, selectedElementId }) {
  const summary = {
    canvas: document?.canvas,
    elements: (document?.elements || []).map((e) => ({
      id: e.id,
      type: e.type,
      x: e.x, y: e.y, width: e.width, height: e.height, zIndex: e.zIndex,
      properties: e.properties,
    })),
    selectedElementId: selectedElementId || null,
  };
  return `Current design document:\n${JSON.stringify(summary)}\n\nUser instruction: ${message}`;
}
