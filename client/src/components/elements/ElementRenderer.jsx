import TextElement from './TextElement.jsx';
import ImageElement from './ImageElement.jsx';
import IconElement from './IconElement.jsx';
import RectangleElement from './RectangleElement.jsx';
import CircleElement from './CircleElement.jsx';
import LineElement from './LineElement.jsx';
import ButtonElement from './ButtonElement.jsx';
import GroupElement from './GroupElement.jsx';

const RENDERERS = {
  text: TextElement,
  image: ImageElement,
  icon: IconElement,
  rectangle: RectangleElement,
  circle: CircleElement,
  line: LineElement,
  button: ButtonElement,
  group: GroupElement,
};

/**
 * Maps an element to its type-specific renderer. Adding a new element type is
 * as simple as adding a component and one entry here.
 */
export default function ElementRenderer({ element }) {
  const Renderer = RENDERERS[element.type];
  if (!Renderer) return null;
  return <Renderer element={element} />;
}
