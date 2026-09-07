"""Cut a generated 6x3 sprite sheet; never synthesizes poses or redraws a character."""
import argparse, hashlib, json
from pathlib import Path
from collections import deque
from PIL import Image

def cut(sheet, files):
    if min(sheet.size) < 480 or max(sheet.size) > 8192:
        raise ValueError('Sheet must be 480..8192 pixels per side')
    if not 1.4 <= sheet.width / sheet.height <= 2.6:
        raise ValueError('Expected a landscape 6-column by 3-row sheet')
    cells = []
    for i, name in enumerate(files):
        row, col = divmod(i, 6)
        cell = sheet.crop((round(col*sheet.width/6), round(row*sheet.height/3),
                           round((col+1)*sheet.width/6), round((row+1)*sheet.height/3))).convert('RGBA')
        px = cell.load(); w,h=cell.size
        # Only remove near-uniform background connected to a cell edge.
        corners = [px[0,0], px[w-1,0], px[0,h-1], px[w-1,h-1]]
        bg = corners[0]
        transparent = all(c[3] <= 32 for c in corners)
        if not transparent:
            if any(max(abs(c[k]-bg[k]) for k in range(3)) > 24 for c in corners):
                raise ValueError(f'{name}: inconsistent cell background; repair this cell')
            def background(x,y):
                c=px[x,y]
                return c[3]<=32 or max(abs(c[k]-bg[k]) for k in range(3))<=36
            queue=deque((x,y) for x in range(w) for y in (0,h-1))
            queue.extend((x,y) for y in range(h) for x in (0,w-1));seen=set()
            while queue:
                x,y=queue.popleft()
                if (x,y) in seen or not (0<=x<w and 0<=y<h):continue
                seen.add((x,y))
                if not background(x,y):continue
                px[x,y]=(*px[x,y][:3],0)
                queue.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
        alpha=cell.getchannel('A').point(lambda a:255 if a>32 else 0);cell.putalpha(alpha)
        box=alpha.getbbox()
        if not box or box[0]<2 or box[1]<2 or box[2]>w-2 or box[3]>h-2:
            raise ValueError(f'{name}: empty or crossing cell boundary; repair this cell')
        cells.append((name,cell,box))
    # One scale for the sheet, based on cell height, never enlarge a sitting pose separately.
    scale=440/(sheet.height/3*.88)
    result={}
    for name,cell,box in cells:
        body=cell.crop(box);size=tuple(max(1,round(n*scale)) for n in body.size)
        if size[0]>496 or size[1]>477 or size[1]<128:
            raise ValueError(f'{name}: character scale outside bounds; fix the sheet spacing')
        body=body.resize(size,Image.Resampling.NEAREST)
        frame=Image.new('RGBA',(512,512));frame.alpha_composite(body,(round((512-cell.width*scale)/2+box[0]*scale),486-size[1]))
        result[name]=frame
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',default='sprite-sheet-plan.json');parser.add_argument('--sheet',required=True)
    args=parser.parse_args();manifest_path=Path(args.manifest).resolve();root=manifest_path.parent
    plan=json.loads(manifest_path.read_text());group=next(g for g in plan['sheets'] if g['sheet']==args.sheet)
    files=group['files']
    if not 1<=len(files)<=18 or any(Path(f).name!=f or not f.endswith('.png') for f in files):raise ValueError('Invalid frame mapping')
    if set(files)&set(plan.get('preservedFiles',[])):raise ValueError('Cannot overwrite verified frames')
    source=root/'sheets'/(args.sheet+'.png')
    if source.is_symlink():raise ValueError('Sheet must be a regular image')
    with Image.open(source) as sheet:frames=cut(sheet,files)
    # Build all cells before writing, so a bad later cell cannot partially replace a sheet.
    for name,frame in frames.items():frame.save(root/name)
    preview=Image.new('RGBA',(512*6,512*3))
    for i,frame in enumerate(frames.values()):preview.alpha_composite(frame,((i%6)*512,(i//6)*512))
    evidence=root/'evidence'/'sheets';evidence.mkdir(parents=True,exist_ok=True)
    preview.save(evidence/(args.sheet+'-contact.png'))
    actions={}
    for name,frame in frames.items():
        action=name.rsplit('-',1)[0]
        rgb=Image.new('RGB',frame.size,'#e9eddc');rgb.paste(frame,mask=frame.getchannel('A'))
        actions.setdefault(action,[]).append(rgb)
    for action,sequence in actions.items():
        if len(sequence)>1:sequence[0].save(evidence/(action+'-preview.gif'),save_all=True,append_images=sequence[1:],duration=180,loop=0)
    report={'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'files':files,'scale':'shared per sheet','cells':{name:frame.getbbox() for name,frame in frames.items()}}
    (evidence/(args.sheet+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
