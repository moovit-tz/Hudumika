from pathlib import Path
p=Path('apps/api/src/services/demurrage.service.ts');s=p.read_text(encoding='utf-8').replace('  if (demurrageDays <= 0 || rateTiers.length === 0) return 0;', '  const validated = tiersSchema.parse(rateTiers);\n  if (demurrageDays <= 0) return 0;').replace('const sorted = [...rateTiers].sort', 'const sorted = [...validated].sort');p.write_text(s,encoding='utf-8')
