// Build-time public downloads only. Runtime is offline and rechecks these hashes.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Artifact destination required');
const lock = JSON.parse(await fs.readFile(new URL('./assets.lock.json', import.meta.url)));
for (const [folder, manifest] of Object.entries(lock)) {
  for (const [name, expected] of Object.entries(manifest.files)) {
    const url = folder === 'phobert-base'
      ? `https://huggingface.co/vinai/phobert-base/resolve/${manifest.revision}/${name}`
      : `https://raw.githubusercontent.com/vncorenlp/VnCoreNLP/${manifest.revision}/${name}`;
    const destination = path.join(root, folder, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw new Error(`Public asset HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(destination));
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(destination)) hash.update(chunk);
    if (hash.digest('hex') !== expected) throw new Error(`Asset integrity failed: ${folder}/${name}`);
    console.log(`Verified ${folder}/${name}`);
  }
  await fs.writeFile(path.join(root, folder, 'artifact-manifest.json'), JSON.stringify(manifest));
}
