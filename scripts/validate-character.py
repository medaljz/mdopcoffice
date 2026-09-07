"""Read-only validation of generated character frames; never edits source pixels."""
import json,sys,hashlib
from collections import deque
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]).resolve();files=json.loads(sys.argv[2]);frames={};digests=set();feet=[];bounds=[]
for name in files:
 p=root/name
 if not p.is_file() or p.is_symlink():raise ValueError('Missing regular frame: '+name)
 if p.stat().st_size>8*1024*1024:raise ValueError('Frame exceeds 8 MB: '+name)
 with Image.open(p) as im:
  if im.format!='PNG' or im.size!=(512,512):raise ValueError('Expected 512x512 PNG: '+name)
  if 'A' not in im.getbands():raise ValueError('Transparent background required: '+name)
  rgba=im.convert('RGBA');alpha=rgba.getchannel('A');bbox=alpha.point(lambda a:255 if a>32 else 0).getbbox()
  if not bbox or min(bbox[0],bbox[1])<8 or max(bbox[2],bbox[3])>504:raise ValueError('Empty or clipped body: '+name)
  if bbox[3]-bbox[1]<128 or bbox[3]<460:raise ValueError('Wrong character scale or ground anchor: '+name)
  mask=alpha.point(lambda a:255 if a>32 else 0);points={(i%512,i//512) for i,a in enumerate(mask.getdata()) if a};total=len(points);largest=0
  while points:
   first=points.pop();q=deque([first]);size=1
   while q:
    x,y=q.popleft()
    for neighbor in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
     if neighbor in points:points.remove(neighbor);q.append(neighbor);size+=1
   largest=max(largest,size)
  if largest<total*.98:raise ValueError('Detached body parts: '+name)
  digest=hashlib.sha256(rgba.tobytes()).hexdigest()
  if digest in digests:raise ValueError('Duplicate pose instead of a new action: '+name)
  digests.add(digest);feet.append(bbox[3]);bounds.append(bbox);frames[name]={'width':512,'height':512,'box':[0,0,512,512]}
if max(feet)-min(feet)>10:raise ValueError('Ground anchors differ by more than 10 pixels')
left=min(b[0] for b in bounds)-2;top=min(b[1] for b in bounds)-2;right=max(b[2] for b in bounds)+2;bottom=max(feet)
for frame in frames.values():frame['box']=[left,top,right-left,bottom-top]
print(json.dumps(frames))
