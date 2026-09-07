import {DESKS,BOARD} from './office-scene.js';
// Floor-space footprints, not the top edge of the isometric artwork.
// All coordinates use the same 1672 × 941 scene units as the renderer.
export const FLOOR = [
 [345,322,1043,452], [370,175,287,151], [685,176,410,150], [1110,176,288,150],
 [175,270,183,211], [277,490,72,369], [30,832,280,61], [28,737,55,125], [88,635,218,47],
 [1346,600,75,230], [242,661,38,220]
];
export const SOLIDS = [
 // The full desk footprint is blocked; no chair-shaped hole through the tabletop.
 ...DESKS.map(d=>[d.x+d.width*(d.scale-(d.scaleX||d.scale)),d.y+(d.top-d.y)*d.scale,d.width*(d.scaleX||d.scale),(d.bottom-d.top)*d.scale]),

 [398,211,219,37],[789,250,216,61],[1177,210,215,39],
 [268,387,90,49],[212,443,94,47],[365,779,240,158],
 // Actual closed glass panels; each executive office has a central door opening.
 [360,280,88,42],[540,280,116,42],[1110,280,128,42],[1316,280,81,42],
 [1100,182,12,137],[657,181,22,140],
 // Reception, room boundary, lounge table, planters, and new screen pedestal.
 [696,787,387,150],[1389,490,280,245],[1400,735,269,48],[1420,783,249,93], [184,329,83,28], [87,719,143,99],
 [280,814,78,65],[1325,701,36,39],BOARD.foot
];
const inRect=(x,y,r,pad=0)=>x>=r[0]-pad&&x<=r[0]+r[2]+pad&&y>=r[1]-pad&&y<=r[1]+r[3]+pad;
export function canStand(x,y){return FLOOR.some(r=>inRect(x,y,r))&&!SOLIDS.some(r=>inRect(x,y,r,8));}
function interval(a,b,r,pad=0){let lo=0,hi=1;for(let axis=0;axis<2;axis++){const d=b[axis]-a[axis],min=r[axis]-pad,max=r[axis]+r[axis+2]+pad;if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max)return null;}else{const t1=(min-a[axis])/d,t2=(max-a[axis])/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return null;}}return [lo,hi];}
export function segmentClear(a,b){if(SOLIDS.some(r=>interval(a,b,r,8)))return false;const parts=FLOOR.map(r=>interval(a,b,r)).filter(Boolean).sort((a,b)=>a[0]-b[0]);let end=0;for(const [lo,hi] of parts){if(lo>end+1e-9)return false;end=Math.max(end,hi);if(end>=1)return true;}return false;}

const GRID=10,W=168,H=95,valid=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)valid[y*W+x]=canStand(x*GRID,y*GRID)?1:0;
const point=id=>[(id%W)*GRID,Math.floor(id/W)*GRID];
function nearest(p,clear=segmentClear){let best=-1,dist=Infinity;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const x=Math.round(p[0]/GRID)+dx,y=Math.round(p[1]/GRID)+dy,id=y*W+x;if(x<0||x>=W||y<0||y>=H||!valid[id])continue;const q=point(id),d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<dist&&clear(p,q)){dist=d;best=id;}}return best;}
// ponytail: this small fixed office uses a 10px floor grid; replace the grid only if rooms become user-editable.
export function routeBetween(from,to,avoid=[]){
 const clear=(a,b)=>segmentClear(a,b)&&avoid.every(c=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((c[0]-a[0])*dx+(c[1]-a[1])*dy)/(dx*dx+dy*dy||1)));const radius=c[2]??28,initial=Math.hypot(a[0]-c[0],a[1]-c[1]);return initial<radius?((a[0]-c[0])*dx+(a[1]-c[1])*dy>=0&&Math.hypot(b[0]-c[0],b[1]-c[1])>initial):Math.hypot(a[0]+t*dx-c[0],a[1]+t*dy-c[1])>=radius;});if(!canStand(...from)||!canStand(...to))return [];if(clear(from,to))return Math.hypot(from[0]-to[0],from[1]-to[1])<.1?[]:[[...to]];const start=nearest(from,clear),end=nearest(to,clear);if(start<0||end<0)return [];const open=new Set([start]),came=new Map(),g=new Map([[start,0]]),f=new Map([[start,0]]);let found=false;
 while(open.size){let current=-1,cost=Infinity;for(const id of open){const n=f.get(id);if(n<cost){cost=n;current=id;}}if(current===end){found=true;break;}open.delete(current);const [x,y]=point(current);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const nx=x/GRID+dx,ny=y/GRID+dy,id=ny*W+nx;if(nx<0||nx>=W||ny<0||ny>=H||!valid[id]||!clear([x,y],point(id)))continue;const score=g.get(current)+Math.hypot(dx,dy)*GRID;if(score<(g.get(id)??Infinity)){came.set(id,current);g.set(id,score);f.set(id,score+Math.hypot(nx*GRID-to[0],ny*GRID-to[1]));open.add(id);}}}
 if(!found)return [];const raw=[to];let at=end;while(at!==start){raw.unshift(point(at));at=came.get(at);}raw.unshift(point(start));const result=[];let origin=from;for(let i=0;i<raw.length;){let last=i;while(last+1<raw.length&&clear(origin,raw[last+1]))last++;result.push(raw[last]);origin=raw[last];i=last+1;}return result;
}
export function heading(dx,dy,previous='right'){if(Math.hypot(dx,dy)<.01)return previous;if(Math.abs(Math.abs(dx)-Math.abs(dy))<Math.max(Math.abs(dx),Math.abs(dy))*.2&&((previous==='left'&&dx<0)||(previous==='right'&&dx>0)||(previous==='up'&&dy<0)||(previous==='down'&&dy>0)))return previous;return Math.abs(dx)>=Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');}
