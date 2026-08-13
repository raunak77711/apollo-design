import { getIcon } from '../../design/icons.js';

export default function IconElement({ element }) {
  const p = element.properties;
  const Icon = getIcon(p.name);
  const size = Math.min(element.width, element.height);
  return (
    <div className="w-full h-full flex items-center justify-center select-none">
      <Icon size={size} color={p.color} strokeWidth={p.strokeWidth || 2} />
    </div>
  );
}
