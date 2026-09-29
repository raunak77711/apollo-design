import { eraserTool } from './eraser.js';
import { freehandTool } from './freehand.js';
import { handTool, selectTool } from './basicTools.js';
import { lineTool } from './lines.js';
import { shapeTool } from './shapes.js';
import { textTool } from './textTools.js';

/** The tool registry. Every tool the toolbar offers is one entry here. */
export function createTools(editor) {
  return {
    select: selectTool(editor),
    hand: handTool(editor),
    pen: freehandTool(editor, 'pen'),
    highlighter: freehandTool(editor, 'highlighter'),
    eraser: eraserTool(editor),
    rectangle: shapeTool(editor, 'rectangle'),
    circle: shapeTool(editor, 'circle'),
    line: lineTool(editor, 'line'),
    arrow: lineTool(editor, 'arrow'),
    text: textTool(editor, 'text'),
    sticky: textTool(editor, 'sticky'),
  };
}
