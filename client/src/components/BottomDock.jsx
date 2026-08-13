import { useState } from 'react';
import { Layers, Sparkles, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import LayersPanel from './LayersPanel.jsx';
import AIChat from './AIChat.jsx';
import ImagesPanel from './ImagesPanel.jsx';

const TABS = [
  { id: 'ai', label: 'Apollo AI', icon: Sparkles },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'images', label: 'Images', icon: ImageIcon },
];

export default function BottomDock({ projectId, activeTab, onTabChange }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`bg-panel border-t border-edge flex flex-col shrink-0 ${collapsed ? 'h-10' : 'h-64'}`}>
      <div className="h-10 flex items-center px-2 gap-1 border-b border-edge">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => { onTabChange(t.id); setCollapsed(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm ${active ? 'bg-panel2 text-white' : 'text-neutral-400 hover:text-white'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={() => setCollapsed((c) => !c)} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white">
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0">
          {activeTab === 'layers' && <LayersPanel />}
          {activeTab === 'ai' && <AIChat />}
          {activeTab === 'images' && <ImagesPanel projectId={projectId} />}
        </div>
      )}
    </div>
  );
}
