from pathlib import Path
p=Path('apps/web/src/pages/Tracker.tsx');s=p.read_text(encoding='utf-8').replace('onClick={loadFleet}', 'onClick={()=>loadFleet()}').replace('onClick={loadSnapshots}', 'onClick={()=>loadSnapshots()}');p.write_text(s,encoding='utf-8')
