import { getIcon } from '../../design/icons.js';

export default function IconElement({ element }) {
  const p = element.properties;
  const library = p.library || 'lucide';
  const Icon = getIcon(p.name, library);
  const size = Math.min(element.width, element.height);
  // Only Lucide's line icons take a stroke width; other libraries are filled.
  const extra = library === 'lucide' ? { strokeWidth: p.strokeWidth || 2 } : {};
  return (
    <div className="w-full h-full flex items-center justify-center select-none">
      <Icon size={size} color={p.color} {...extra} />
    </div>
  );
}
