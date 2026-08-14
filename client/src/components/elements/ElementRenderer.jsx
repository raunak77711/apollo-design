import TextElement from './TextElement.jsx';
import ImageElement from './ImageElement.jsx';
import IconElement from './IconElement.jsx';
import RectangleElement from './RectangleElement.jsx';
import CircleElement from './CircleElement.jsx';
import PolyElement from './PolyElement.jsx';
import LineElement from './LineElement.jsx';
import ButtonElement from './ButtonElement.jsx';
import GroupElement from './GroupElement.jsx';

const RENDERERS = {
  text: TextElement,
  image: ImageElement,
  icon: IconElement,
  rectangle: RectangleElement,
  circle: CircleElement,
  polygon: PolyElement,
  star: PolyElement,
  line: LineElement,
  button: ButtonElement,
  group: GroupElement,
};

/**
 * Maps an element to its type-specific renderer. Adding a new element type is
 * as simple as adding a component and one entry here. `preview` tells renderers
 * they are drawing a thumbnail rather than the live canvas.
 */
export default function ElementRenderer({ element, preview = false }) {
  const Renderer = RENDERERS[element.type];
  if (!Renderer) return null;
  return <Renderer element={element} preview={preview} />;
}
