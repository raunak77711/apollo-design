import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from './toast.jsx';

/**
 * One path into the editor, shared by Home, Templates and the new-design
 * dialog: create the project, then hand the prompt (if any) to the editor so it
 * can generate on arrival — along with whatever creative preferences the user
 * gave before submitting.
 */
export function useCreateDesign() {
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async ({ name, canvas, document, prompt, referenceImages, preferences } = {}) => {
      setCreating(true);
      try {
        const project = await api.createProject({
          name: name || 'Untitled design',
          canvas,
          document,
        });
        navigate(`/editor/${project.id}`, {
          state: {
            prompt: prompt || '',
            referenceImages: referenceImages || [],
            preferences: preferences || null,
          },
        });
        return project;
      } catch (err) {
        toast.error('Apollo could not create that design', err.message);
        setCreating(false);
        return null;
      }
    },
    [navigate, toast]
  );

  return { create, creating };
}
