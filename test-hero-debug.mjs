import { GroqAdapter } from './core/dist/providers/adapters/groq.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { addAdditionalPropertiesFalseRecursive } from './core/dist/providers/adapters/groq.js';

const apiKey = process.env.GROQ_API_KEY;
const adapter = new GroqAdapter(apiKey, 'openai/gpt-oss-120b');

const schema = z.object({
  path: z.string(),
  content: z.string(),
  dependencies: z.record(z.string(), z.string()).default({})
}).strict();

// Test the schema generation directly
const jsonSchema = require('zod-to-json-schema').zodToJsonSchema(
  require('zod').object({
    path: require('zod').string(),
    content: require('zod').string(),
    dependencies: require('zod').record(require('zod').string(), require('zod').string()).default({})
  }.strict(), { target: 'openApi3', $refStrategy: 'none', removeAdditionalStrategy: 'strict' });

console.log('Before post-processing:');
console.log('dependencies.additionalProperties:', JSON.stringify(jsonSchema.properties.dependencies.additionalProperties));

const { addAdditionalPropertiesFalseRecursive } = await import('./core/dist/providers/adapters/groq.js');
addAdditionalPropertiesFalseRecursive(jsonSchema);

console.log('After post-processing:');
console.log('dependencies.additionalProperties:', JSON.stringify(jsonSchema.properties.dependencies.additionalProperties));
console.log('Top-level additionalProperties:', JSON.stringify(jsonSchema.additionalProperties));