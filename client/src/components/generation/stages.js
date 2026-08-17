/**
 * What Apollo says it is doing, and when.
 *
 * Every line here is tied to a real boundary in the server's pipeline — the
 * stage names arrive over the generation stream as they are actually crossed.
 * Nothing is on a timer and there is no progress bar: the two slow stages (the
 * art-direction model call and sourcing photography) have no measurable
 * progress, and inventing a percentage for them would be lying to the user
 * about the one thing they are watching the screen to learn.
 *
 * What *is* smoothed is the reading speed. Composition and critique take
 * milliseconds, so their lines would otherwise flash past unread; the queue in
 * `useGenerationStages` holds each message for a beat before moving on, while
 * never showing one the server has not reached.
 */

export const STAGES = {
  understanding: {
    label: 'Understanding your idea',
    detail: 'Reading the brief and the format.',
  },
  directing: {
    label: 'Planning the composition',
    detail: 'Choosing a direction, a palette and a type voice.',
  },
  reconsidering: {
    label: 'Reworking the direction',
    detail: 'The first pass fell short — trying something different.',
  },
  curating: {
    label: 'Finding the perfect visuals',
    detail: 'Judging each frame on where it is quiet enough for type.',
  },
  composing: {
    label: 'Building your layout',
    detail: 'Setting the grid, the type scale and every layer.',
  },
  refining: {
    label: 'Adding the finishing touches',
    detail: 'Measuring contrast, spacing and balance, then repairing them.',
  },
  done: {
    label: 'Your design is ready',
    detail: 'Every layer is editable.',
  },
};

/** The order stages are allowed to appear in, so the queue never goes backwards. */
export const STAGE_ORDER = ['understanding', 'directing', 'reconsidering', 'curating', 'composing', 'refining', 'done'];

export const stageLabel = (stage) => STAGES[stage]?.label || STAGES.understanding.label;
export const stageDetail = (stage) => STAGES[stage]?.detail || STAGES.understanding.detail;
