/**
 * Abstract AI provider. Concrete providers (DeepSeek, and later OpenAI/Claude)
 * implement these methods. The rest of the app depends only on this interface,
 * never on a specific vendor SDK.
 */
export class AIProvider {
  /**
   * Turn a natural-language instruction + current design into a list of
   * validated Apollo operations.
   * @returns {Promise<{ operations: object[], message: string }>}
   */
  async generateOperations(/* { message, document, selectedElementId } */) {
    throw new Error('generateOperations() not implemented');
  }
}
