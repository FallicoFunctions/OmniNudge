import type { WorldSocketStatus } from '../network/worldSocket';

export function createShowReviewRecovery(root:Document=document){
  const entry=root.getElementById('review-entry')!;
  const title=root.getElementById('review-entry-title')!;
  const message=root.getElementById('review-entry-message')!;
  const status=root.getElementById('review-connection')!;
  return {
    loading(){
      entry.hidden=false;
      title.textContent='Opening the soundbooth…';
      message.textContent='Loading the booth, fireworks and drone controls.';
      status.textContent='Connecting…';
    },
    connection(next:WorldSocketStatus){
      status.textContent=next==='open'?'Connected · shared room':'Reconnecting…';
      if(next==='open')entry.hidden=true;
      else if(next==='error'||next==='closed'){
        entry.hidden=false;
        title.textContent='The booth is disconnected';
        message.textContent='We’re trying to reconnect. You can also choose a player again to open a fresh playtest connection.';
      }
    },
    failed(){
      entry.hidden=false;
      title.textContent='The booth could not open';
      message.textContent='Return to the playtest page and open a fresh player view to try again.';
      status.textContent='Preview unavailable';
    },
  };
}
