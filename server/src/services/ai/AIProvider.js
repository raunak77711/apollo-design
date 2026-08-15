/**
 * Abstract AI provider. Concrete providers (DeepSeek, and later OpenAI/Claude)
 * implement these methods. The rest of the app depends only on this interface,
 * never on a specific vendor SDK.
 */
export class AIProvider {
  /**
   * Art-direct a design: turn a plain request into a structured brief — style,
   * palette, type pairing, layout, copy and photographic direction.
   *
   * Deliberately returns no geometry. Placing elements is the composer's job;
   * asking a language model for coordinates is what makes generated layouts
   * look misaligned and improvised.
   *
   * @returns {Promise<object>} a design brief (see design/artDirection.js)
   */
  async planDesign(/* { message, canvas, variation, critique, previous } */) {
    throw new Error('planDesign() not implemented');
  }

  /**
   * Turn a natural-language instruction + current design into a list of
   * validated Apollo operations. Used for editing an existing design.
   * @returns {Promise<{ operations: object[], message: string }>}
   */
  async generateOperations(/* { message, document, selectedElementId } */) {
    throw new Error('generateOperations() not implemented');
  }
}
