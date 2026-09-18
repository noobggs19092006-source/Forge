const { zodToJsonSchema } = require('zod-to-json-schema');
const { z } = require('zod');

function addAdditionalPropertiesFalseRecursive(obj) {
  if (obj && typeof obj === 'object') {
    if (obj.type === 'object') {
      obj.additionalProperties = false;
      if (obj.properties) {
        for (const key of Object.keys(obj.properties)) {
          addAdditionalPropertiesFalseRecursive(obj.properties[key]);
        }
      }
      if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
        addAdditionalPropertiesFalseRecursive(obj.additionalProperties);
      }
    }
    if (obj.items) {
      addAdditionalPropertiesFalseRecursive(obj.items);
    }
    if (obj.allOf) {
      obj.allOf.forEach(addAdditionalPropertiesFalseRecursive);
    }
    if (obj.anyOf) {
      obj.anyOf.forEach(addAdditionalPropertiesFalseRecursive);
    }
    if (obj.oneOf) {
      obj.oneOf.forEach(addAdditionalPropertiesFalseRecursive);
    }
  }
}

const schema = z.object({
  path: z.string(),
  content: z.string(),
  dependencies: z.record(z.string(), z.string()).default({})
}).strict();

const jsonSchema = zodToJsonSchema(
  z.object({
    path: z.string(),
    content: z.string(),
    dependencies: z.record(z.string(), z.string()).default({})
  }).strict(),
  { target: 'openApi3', $refStrategy: 'none', removeAdditionalStrategy: 'strict' }
);

addAdditionalPropertiesFalseRecursive(jsonSchema);
console.log(JSON.stringify(jsonSchema, null, 2));