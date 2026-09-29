// Refresh this pass's female outputs; verify the retained male deliveries.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=process.cwd(),assets=path.join(root,'public/assets/avatars/complete-pair');
const file=path.join(root,'src/player/completeAvatarDownloads.json');
const manifest=JSON.parse(await fs.readFile(file,'utf8'));
for(const [name,old] of Object.entries(manifest)){
 const raw=await fs.readFile(path.join(assets,name)),sha256=createHash('sha256').update(raw).digest('hex');
 if(name.startsWith('female')){
  const zipped=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(zipped),raw);
  await fs.writeFile(path.join(assets,name+'.gz'),zipped);
  manifest[name]={bytes:raw.length,gzipBytes:zipped.length,sha256};
  console.log(name,'lossless delivery refreshed');
 }else{
  const zipped=await fs.readFile(path.join(assets,name+'.gz'));assert.deepEqual(gunzipSync(zipped),raw);
  assert.deepEqual(old,{bytes:raw.length,gzipBytes:zipped.length,sha256});
  console.log(name,'retained delivery verified');
 }
}
await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
