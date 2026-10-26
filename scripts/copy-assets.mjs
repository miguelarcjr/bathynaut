import fs from 'node:fs';
import path from 'node:path';

const storageDist = 'dist/storage';
const explorerDist = 'dist/explorer';

if (!fs.existsSync(storageDist)) fs.mkdirSync(storageDist, { recursive: true });
if (!fs.existsSync(explorerDist)) fs.mkdirSync(explorerDist, { recursive: true });

fs.copyFileSync('src/storage/schema.sql', path.join(storageDist, 'schema.sql'));
fs.copyFileSync('src/explorer/template.html', path.join(explorerDist, 'template.html'));

console.log('✅ Assets copiados para dist com sucesso!');
