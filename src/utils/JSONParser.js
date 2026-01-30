/**
 * JSON parser for agent responses
 */
export class JSONParser {
  /**
   * Parse JSON from agent response
   * Handles JSON wrapped in markdown code blocks
   */
  parse(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: expected string');
    }

    // Try to parse as-is first (pure JSON)
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      // Continue to try other methods
    }

    // Try to extract JSON from markdown code block
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const match = text.match(codeBlockRegex);
    
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {
        throw new Error(`Failed to parse JSON from code block: ${e.message}`);
      }
    }

    // Try to find JSON object/array in text
    const jsonObjectRegex = /\{[\s\S]*\}/;
    const jsonArrayRegex = /\[[\s\S]*\]/;
    
    const objectMatch = text.match(jsonObjectRegex);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (e) {
        // Continue
      }
    }

    const arrayMatch = text.match(jsonArrayRegex);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e) {
        // Continue
      }
    }

    throw new Error('No valid JSON found in response');
  }

  /**
   * Validate parsed JSON against schema
   */
  validate(data, schema) {
    if (schema.type === 'array' && !Array.isArray(data)) {
      throw new Error('Expected array');
    }

    if (schema.type === 'object' && typeof data !== 'object') {
      throw new Error('Expected object');
    }

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    return true;
  }
}
