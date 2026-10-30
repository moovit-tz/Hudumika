import {describe,it,expect} from 'vitest';
import {csvCell,csvText} from '@hudumika/types';
describe('finance export safety',()=>{
 it('neutralises formulas in untrusted text including whitespace prefixes',()=>{for(const input of ['=1+1',' +SUM(A1)','-cmd','@SUM(A1)','\tformula','\rformula'])expect(csvCell(input)).toBe(`"'${input}"`);expect(csvCell(-12.34)).toBe('"-12.34"');});
 it('quotes delimiters, double quotes, newlines and Unicode',()=>{expect(csvText([['Résumé','a"b','x,y','line\nnext']])).toBe('\uFEFF"Résumé","a""b","x,y","line\nnext"');});
});
