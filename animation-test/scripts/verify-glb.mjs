import fs from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
const bytes = new Uint8Array(await fs.readFile(new URL('../public/assets/mudkip.glb', import.meta.url)));
const result = await validateBytes(bytes, { uri: 'mudkip.glb', maxIssues: 100 });
await fs.writeFile(new URL('../../docs/gltf-validation.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ bytes: bytes.length, errors: result.issues.numErrors, warnings: result.issues.numWarnings, messages: result.issues.messages }, null, 2));
if (result.issues.numErrors) process.exitCode = 1;
