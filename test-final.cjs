const { zodToJsonSchema } = require('zod-to-json-schema');
const { z } = require('zod');

const schema = z.object({
  path: z.string(),
  content: z.string(),
  dependencies: z.record(z.string(), z.string()).default({})
});

const strictSchema = schema.strict();

const jsonSchema = require('zod-to-json-schema').zodToJsonSchema(
  strictSchema,
  { target: 'openApi3', $refStrategy: 'none', removeAdditionalStrategy: 'strict' }
);

console.log('Before post-processing:');
console.log('dependencies.additionalProperties:', JSON.stringify(jsonSchema.properties.dependencies.additionalProperties));

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

addAdditionalPropertiesFalseRecursive(jsonSchema);

console.log('After post-processing:');
console.log('dependencies.additionalProperties:', JSON.stringify(jsonSchema.properties.dependencies.additionalProperties));
console.log('Top-level additionalProperties:', JSON.stringify(jsonSchema.additionalProperties));