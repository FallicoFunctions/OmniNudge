// Only the non-secret local fixture port survives reload. Credentials remain
// in memory and the player picker always stays on a loopback HTTP origin.
export function showReviewLocation(search:string,pathname:string){
  const parameters=new URLSearchParams(search);
  let port=parameters.get('reviewPort')??'4176';
  if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)port='4176';
  try{
    const server=new URL(parameters.get('world')??'');
    if(server.protocol==='ws:'&&!server.username&&!server.password
      &&(server.hostname==='127.0.0.1'||server.hostname==='localhost'))port=server.port||'80';
  }catch{ /* Direct entry uses the validated saved port or the standard fixture. */ }
  port=Number(port)>0&&Number(port)<=65535?String(Number(port)):'4176';
  return {hub:`http://127.0.0.1:${port}/review`,cleanUrl:pathname+(port==='4176'?'':`?reviewPort=${port}`)};
}
