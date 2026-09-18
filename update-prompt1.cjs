const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const t = `- When using CSS Modules with dashed class names (kebab-case), you MUST use bracket notation (e.g. className={styles['my-dashed-class']}). NEVER use dot notation (e.g. styles.my-dashed-class is an invalid subtraction in TypeScript).`;
const r = `- CSS Modules Bracket Notation: You MUST use bracket notation for any class name containing a hyphen (kebab-case). Dot notation is mathematically invalid in TypeScript and will cause build failures.
    - INCORRECT: <div className={styles.hero-section} />
    - CORRECT:   <div className={styles['hero-section']} />`;

if (content.includes(t)) {
    content = content.replace(t, r);
    fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
    console.log('Fixed CSS Modules prompt in codegen-agent.ts');
} else {
    console.log('Could not find the target string in codegen-agent.ts');
}
