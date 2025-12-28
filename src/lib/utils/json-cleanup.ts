/**
 * JSON Cleanup Utilities
 * Handles parsing and cleaning JSON responses from AI models
 */

/**
 * Parse and clean JSON from Gemini/GPT responses
 * Handles common issues like markdown code blocks, trailing commas, truncated JSON, etc.
 */
export function parseGeminiJson<T>(text: string): T {
  // Remove markdown code blocks
  let clean = text
    .replace(/^```json\s*/gi, '')
    .replace(/^```\s*/gi, '')
    .replace(/```\s*$/gi, '')
    .trim()
  
  // If still wrapped in code blocks, try to extract
  const jsonMatch = clean.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    clean = jsonMatch[1].trim()
  }
  
  // Fix common JSON issues
  clean = clean
    // Remove trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, '$1')
    // Remove control characters except newlines and tabs
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // Fix unescaped newlines in strings (but not in the structure)
    .replace(/(?<!\\)\\n/g, '\\n')
  
  try {
    return JSON.parse(clean) as T
  } catch (firstError) {
    // Try to find JSON object in text
    const jsonStart = clean.indexOf('{')
    const jsonEnd = clean.lastIndexOf('}')
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const extracted = clean.slice(jsonStart, jsonEnd + 1)
      try {
        return JSON.parse(extracted) as T
      } catch {
        // Try to fix truncated JSON
        const fixed = fixTruncatedJson(extracted)
        try {
          return JSON.parse(fixed) as T
        } catch {
          // Continue to next attempt
        }
      }
    }
    
    // Try to find JSON array
    const arrayStart = clean.indexOf('[')
    const arrayEnd = clean.lastIndexOf(']')
    
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      const extracted = clean.slice(arrayStart, arrayEnd + 1)
      try {
        return JSON.parse(extracted) as T
      } catch {
        // Continue to throw original error
      }
    }
    
    // Last resort: try to fix truncated JSON from beginning
    if (jsonStart !== -1) {
      const truncated = clean.slice(jsonStart)
      const fixed = fixTruncatedJson(truncated)
      try {
        return JSON.parse(fixed) as T
      } catch {
        // Give up
      }
    }
    
    throw firstError
  }
}

/**
 * Attempt to fix truncated JSON by closing open brackets and quotes
 */
function fixTruncatedJson(json: string): string {
  let fixed = json.trim()
  
  // Remove trailing incomplete key-value pairs (e.g., "key":)
  fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*$/, '')
  
  // Remove trailing incomplete values
  fixed = fixed.replace(/:\s*"[^"]*$/, ': ""')
  
  // Remove trailing commas
  fixed = fixed.replace(/,\s*$/, '')
  
  // Count and close brackets
  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let escaped = false
  
  for (const char of fixed) {
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    
    if (char === '{') openBraces++
    if (char === '}') openBraces--
    if (char === '[') openBrackets++
    if (char === ']') openBrackets--
  }
  
  // If we're in a string, close it
  if (inString) {
    fixed += '"'
  }
  
  // Close open brackets
  while (openBrackets > 0) {
    fixed += ']'
    openBrackets--
  }
  
  // Close open braces
  while (openBraces > 0) {
    fixed += '}'
    openBraces--
  }
  
  return fixed
}

/**
 * Deep stringify any value to a string or string array
 * Handles nested objects and arrays properly
 */
export function deepStringify(value: unknown): string | string[] {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  
  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object' && v !== null) {
        // Object inside array - convert to structured text
        return Object.entries(v)
          .filter(([, val]) => val !== null && val !== undefined && val !== '')
          .map(([k, val]) => {
            const strVal = deepStringify(val)
            return `${k}: ${Array.isArray(strVal) ? strVal.join(', ') : strVal}`
          })
          .join(', ')
      }
      const result = deepStringify(v)
      return Array.isArray(result) ? result.join(', ') : result
    })
  }
  
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => {
        const strVal = deepStringify(v)
        return `${k}: ${Array.isArray(strVal) ? strVal.join(', ') : strVal}`
      })
      .join('; ')
  }
  
  return String(value)
}

/**
 * Safely stringify for display (never returns [object Object])
 */
export function safeStringify(value: unknown): string {
  const result = deepStringify(value)
  return Array.isArray(result) ? result.join(', ') : result
}

/**
 * Convert an array of objects to an array of strings
 */
export function objectArrayToStrings<T extends Record<string, unknown>>(
  arr: T[] | undefined,
  formatter: (item: T) => string
): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.map(item => {
    if (typeof item === 'string') return item
    return formatter(item)
  })
}


