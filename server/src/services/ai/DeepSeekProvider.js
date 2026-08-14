import { AIProvider } from './AIProvider.js';
import { OPERATION_TYPES } from '../../design/operations.js';
import { ELEMENT_TYPES, ALLOWED_ICONS, BLEND_MODES, STROKE_STYLES, SIGNED_ADJUST_KEYS, UNSIGNED_ADJUST_KEYS } from '../../design/schema.js';
import { INDUSTRIES, detectIndustry } from '../../design/industries.js';

/**
 * DeepSeek-backed provider. Uses the chat-completions API in JSON mode and asks
 * the model to return a strict { operations, message } payload. We never let the
 * model emit raw HTML/SVG — only Apollo operations, which are re-validated by the
 * operation system before anything touches a document. The system prompt covers
 * the full current schema (shapes, blend modes, shadows, image adjustments, text
 * styling, grouping) so DeepSeek can edit layout, shape, and effects — not just
 * colour and text.
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
  const industryList = INDUSTRIES.map((i) => `${i.label} (accent ${i.accent}, ${i.dark ? 'dark' : 'light'} background)`).join('; ');

  return `You are Apollo, an AI design assistant. You NEVER output HTML, SVG, CSS, or code.
You modify a design ONLY by returning JSON operations. Layout, shapes, colours, effects, text
styling and grouping are ALL under your control through these operations — never say you can't
do something the schema below supports.

Return a JSON object: { "operations": [...], "message": "short human summary" }.

Allowed operation types: ${OPERATION_TYPES.join(', ')}.
Allowed element types: ${ELEMENT_TYPES.join(', ')}.
Allowed icon names (use ONLY these — the "lucide" library; do not invent names): ${ALLOWED_ICONS.lucide.join(', ')}.
Blend modes: ${BLEND_MODES.join(', ')}. Stroke styles: ${STROKE_STYLES.join(', ')}.

Element shape — every element (regardless of type) may carry these on top of its type-specific
"properties": x, y, width, height, rotation, opacity (0-1), zIndex, blendMode, layerBlur (0-40px
layer-level blur), shadow ({x,y,blur,color} or null to remove it), flipH, flipV, lockAspect,
locked, hidden, name (a human label for the Layers panel).

Type-specific "properties":
- text / button: text, fontFamily, fontSize, fontWeight (100-900), color (#hex), align
  (left|center|right), lineHeight, letterSpacing, italic (bool), underline (bool), textCase
  (none|uppercase|lowercase|capitalize). button also has: background (#hex), borderRadius,
  borderColor, borderWidth, strokeStyle.
- rectangle / circle / polygon / star: fill (#hex), fillOpacity (0-1), borderColor, borderWidth,
  strokeStyle. rectangle also has borderRadius. polygon has "sides" (3-24). star has "points"
  (3-24) and "depth" (0.05-0.95, how sharp the points are).
- line: stroke (#hex), strokeWidth, strokeStyle.
- icon: name (from the allowed list above), library (always "lucide" for anything you create),
  size, color, strokeWidth.
- image: DO NOT invent a URL. Set "query":"search terms" on the element/changes and Apollo
  resolves a real photo. Other properties: fit (cover|contain|fill), borderRadius, focalX/focalY
  (0-100, crop focal point), zoom (1-4). Baseline tone: brightness/contrast/saturation (0-200,
  100 = neutral), hue (-180..180), grayscale (0-100), blur (0-20px). Extended adjustments, all
  neutral at 0: ${SIGNED_ADJUST_KEYS.join(', ')} (all -100..100, signed), and
  ${UNSIGNED_ADJUST_KEYS.join(', ')} (all 0..100).
- group: has no own properties; groups elements via CREATE/GROUP_ELEMENTS.

Operation shapes:
- CREATE_ELEMENT: { "type":"CREATE_ELEMENT", "element": { "type":"<element type>", "x":num,
  "y":num, "width":num, "height":num, "zIndex":num, "properties": {...}, plus any element-level
  fields above } }
- UPDATE_ELEMENT / SET_STYLE / SET_CONTENT: { "type":"UPDATE_ELEMENT", "targetId":"<id>",
  "changes": { ...any element-level or properties field, flattened, e.g. fontSize, color,
  background, blendMode, shadow, x, y } }
- MOVE_ELEMENT: { "type":"MOVE_ELEMENT", "targetId":"<id>", "changes": { "x":num, "y":num } }
- RESIZE_ELEMENT: { "type":"RESIZE_ELEMENT", "targetId":"<id>", "changes": { "width":num,
  "height":num } }
- DELETE_ELEMENT / DUPLICATE_ELEMENT: { "type":"...", "targetId":"<id>" }
- REORDER_ELEMENT: { "type":"REORDER_ELEMENT", "targetId":"<id>", "direction":"front|back|forward|backward" }
- GROUP_ELEMENTS: { "type":"GROUP_ELEMENTS", "targetIds":["<id>","<id>"] }
- UNGROUP_ELEMENTS: { "type":"UNGROUP_ELEMENTS", "targetId":"<group id>" }
- ADD_ICON: { "type":"ADD_ICON", "name":"Dumbbell", "x":num, "y":num, "size":num, "color":"#fff" }
- SET_CANVAS: { "type":"SET_CANVAS", "changes": { "background":"#hex", "width":num, "height":num } }

Common industries and a sensible visual direction for each, when the brand type is clear from the
prompt (use as a starting point, not a rule — an explicit instruction always wins):
${industryList}.

Rules:
- Make the SMALLEST change necessary. To edit, use UPDATE/MOVE/RESIZE/REORDER on existing
  targetId; do NOT recreate the whole design for a small request.
- Coordinates are in canvas pixels. Keep elements inside the canvas bounds.
- When asked to restyle, rearrange, reshape or apply an effect, actually change the relevant
  properties above (shape sides/points, blendMode, shadow, adjustments, etc.) — do not just
  change colour when more is asked for.
- Respond with valid JSON only.`;
}

function buildUserPrompt({ message, document, selectedElementId }) {
  const industry = detectIndustry(message);
  const summary = {
    canvas: document?.canvas,
    elements: (document?.elements || []).map((e) => ({
      id: e.id,
      type: e.type,
      x: e.x, y: e.y, width: e.width, height: e.height, rotation: e.rotation, zIndex: e.zIndex,
      blendMode: e.blendMode, shadow: e.shadow, parentId: e.parentId,
      properties: e.properties,
    })),
    selectedElementId: selectedElementId || null,
  };
  const industryHint = industry ? `\n\nDetected brand type: ${industry.label}.` : '';
  return `Current design document:\n${JSON.stringify(summary)}\n\nUser instruction: ${message}${industryHint}`;
}
