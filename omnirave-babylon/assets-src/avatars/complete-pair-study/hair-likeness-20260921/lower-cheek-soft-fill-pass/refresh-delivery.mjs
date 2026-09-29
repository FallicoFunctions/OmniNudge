// Refresh female delivery only. Another task owns the current male revision.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=process.cwd(),assets=path.join(root,'public/assets/avatars/complete-pair');
const file=path.join(root,'src/player/completeAvatarDownloads.json');
const updates={};
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const raw=await fs.readFile(path.join(assets,name)),sha256=createHash('sha256').update(raw).digest('hex');
  const zipped=gzipSync(raw,{level:9});assert(gunzipSync(zipped).equals(raw),`${name}: gzip roundtrip mismatch`);
  await fs.writeFile(path.join(assets,name+'.gz'),zipped);
  updates[name]={bytes:raw.length,gzipBytes:zipped.length,sha256};
  console.log(name,'lossless delivery refreshed');
}
// Merge the latest other-task entries and publish the complete file atomically.
const sync=await import('node:fs');
let written=false;
for(let attempt=0;attempt<5&&!written;attempt++){
 const fresh=sync.readFileSync(file,'utf8'),temp=file+`.female-${process.pid}.tmp`;
 sync.writeFileSync(temp,JSON.stringify({...JSON.parse(fresh),...updates},null,2)+'\n');
 if(sync.readFileSync(file,'utf8')!==fresh){sync.unlinkSync(temp);continue;}
 sync.renameSync(temp,file);written=true;
}
assert(written,'Concurrent manifest update; rerun to merge female entries');
