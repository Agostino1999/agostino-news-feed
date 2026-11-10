"""Collect national voting intentions; keep provenance and the last valid archive.

SWG is read directly. Wikipedia is a discovery/index source with original links.
The CC-BY onData/ruggsea archive supplies otherwise missing registry deposits;
deposit dates are never presented as fieldwork or publication dates.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import io
import json
import logging
import math
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from bs4 import BeautifulSoup
from pypdf import PdfReader

WIKI = 'https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Italian_general_election'
SWG = 'https://www.swg.it/osservatorio'
REGISTRY = 'https://www.sondaggipoliticoelettorali.it/ListaSondaggi.aspx'
ARCHIVE = 'https://raw.githubusercontent.com/ruggsea/llm_italian_poll_scraper/main/italian_polls.jsonl'
ARCHIVE_PAGE = 'https://github.com/ruggsea/llm_italian_poll_scraper'
PARTIES = {
 'fdi': "Fratelli d’Italia", 'pd': 'Partito Democratico', 'm5s': 'Movimento 5 Stelle',
 'fi': 'Forza Italia', 'lega': 'Lega', 'avs': 'Alleanza Verdi e Sinistra',
 'azione': 'Azione', 'iv': 'Italia Viva / Casa Riformista', 'europa': '+Europa',
 'nm': 'Noi Moderati', 'scn': 'Sud Chiama Nord', 'pld': 'Partito Liberaldemocratico',
 'fn': 'Futuro Nazionale', 'altri': 'Altri partiti', 'altri-csx': 'Altri centrosinistra',
 'progetto-civico': 'Progetto Civico', 'psi': 'Avanti / PSI', 'ora': 'Ora!',
 'piu-uno': 'Più Uno', 'pap': 'Potere al Popolo', 'pci': 'Partito Comunista',
 'rifondazione': 'Rifondazione Comunista',
}
COLS = {'FdI':'fdi','PD':'pd','M5S':'m5s','FI':'fi','Lega':'lega','AVS':'avs',
        'A':'azione','IV':'iv','+E':'europa','NM':'nm','ScN':'scn','PLD':'pld','FN':'fn','Others':'altri'}
PATTERNS = [
 ('fdi',r'fratelli|^fdi\b'), ('pd',r'partito democratico|^pd\b'),
 ('m5s',r'movimento (?:5|cinque) stelle|^m5s\b'), ('fi',r'forza italia'),
 ('avs',r'alleanza verdi|verdi[ -]+sinistra|^avs\b'), ('lega',r'^lega\b'),
 ('azione',r'^azione\b'), ('iv',r'italia viva|casa riformista'), ('europa',r'^[+]?\s*europa\b'),
 ('nm',r'noi moderati'), ('scn',r'sud chiama nord|cateno.*de luca'),
 ('pld',r'liberaldemocratic'), ('fn',r'futuro nazionale'),
 ('altri-csx',r'altr[ioe].*centro.?sinistra'), ('altri',r'^altr[ioe]\b|^altro partito'),
 ('progetto-civico',r'progetto civico'), ('psi',r'\bpsi\b|^avanti\b'),
 ('ora',r'^ora\b'), ('piu-uno',r'piu.?\s*(?:uno|1)'), ('pap',r'potere al popolo'),
 ('pci',r'partito comunista'), ('rifondazione',r'rifondazione'),
]

def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value).lower().replace('’', "'"))
                   if not unicodedata.combining(c))

def party_id(label):
    key=norm(label)
    for identifier, pattern in PATTERNS:
        if re.search(pattern,key): return identifier
    return None

def canonical_pollster(label):
    key=norm(label)
    for name,pattern in [('SWG',r'\bswg\b'),('Tecnè',r'tecne'),('Ipsos',r'ipsos'),
                         ('Istituto Piepoli',r'piepoli|pieopoli'),('Ixè',r'\bixe\b'),('EMG',r'\bemg\b'),
                         ('Only Numbers',r'only numbers'),('Termometro Politico',r'termometro'),
                         ('BiDiMedia',r'bidimedia'),('Demos',r'demos'),('Eumetra',r'eumetra'),('Lab21',r'lab\s*21')]:
        if re.search(pattern,key): return name
    return re.sub(r'\s+',' ',label).strip()[:100]

def number(value):
    match=re.match(r'^\s*(\d{1,3}(?:[.,]\d+)?)',str(value))
    return float(match.group(1).replace(',','.')) if match else None

def result(identifier,value,label=None):
    return {'party':identifier,'name':label or PARTIES[identifier],'value':value}

def validate(poll, today=None):
    today=today or date.today()
    try:
        day=date.fromisoformat(poll['date'])
        rows=poll['results']
        ids=[row['party'] for row in rows]
        values=[row['value'] for row in rows]
        return (day<=today and len(rows)>=5 and len(ids)==len(set(ids))
                and len(set(ids)&{'fdi','pd','m5s','fi','lega','avs'})>=5
                and all(isinstance(v,(int,float)) and math.isfinite(v) and 0<=v<=100 for v in values)
                and 98.5<=sum(values)<=101.5
                and bool(poll['pollster']) and poll['source']['url'].startswith('https://'))
    except (KeyError,ValueError,TypeError): return False

def finish(poll):
    poll['pollster']=canonical_pollster(poll['pollster'])
    poll['id']=hashlib.sha256(f"{poll['pollster']}|{poll['date']}|{poll['dateType']}".encode()).hexdigest()[:20]
    poll['results']=sorted(poll['results'],key=lambda r:(-r['value'],r['party']))
    return poll

def download(url, limit=25_000_000):
    url=urllib.parse.quote(url,safe=':/?&=%+#,')
    for attempt in range(2):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'AgostinoDashboard/1.0 (national polling tracker)',
                                                       'Accept':'text/html,application/pdf,application/json;q=0.9,*/*;q=0.8'})
            with urllib.request.urlopen(request,timeout=30) as response:
                data=response.read(limit+1)
            if len(data)>limit: raise ValueError('Source exceeds size limit')
            return data
        except Exception:
            if attempt: raise
            time.sleep(1)

def clean_cell(cell):
    clone=BeautifulSoup(str(cell),'html.parser')
    for el in clone.select('sup,.hidden-content,.mw-collapsible-content'): el.decompose()
    return clone.get_text(' ',strip=True)

def expand_rows(table):
    """Respect colspan and rowspan; merged scenario cells are rejected later."""
    active={}
    for row in table.find_all('tr',recursive=False) or table.select(':scope > tbody > tr'):
        grid={col:cell for col,(cell,remaining) in active.items()}
        upcoming={col:(cell,remaining-1) for col,(cell,remaining) in active.items() if remaining>1}
        col=0
        for cell in row.find_all(['td','th'],recursive=False):
            while col in grid: col+=1
            width=int(cell.get('colspan',1)); height=int(cell.get('rowspan',1))
            for offset in range(width):
                grid[col+offset]=cell
                if height>1: upcoming[col+offset]=(cell,height-1)
            col+=width
        active=upcoming
        yield [grid.get(i) for i in range(max(grid,default=-1)+1)]

def parse_wikipedia(html_text,today=None):
    today=today or date.today()
    soup=BeautifulSoup(html_text,'html.parser'); polls=[]
    for table in soup.select('table.wikitable'):
        if 'Fieldwork date' not in table.get_text(' ',strip=True)[:700]: continue
        columns=None
        for cells in expand_rows(table):
            text=[clean_cell(c) if c else '' for c in cells]
            if 'Fieldwork date' in text and 'Polling firm' in text and 'FdI' in text and 'PD' in text:
                columns={re.sub(r'\s*\[.*','',v).strip():i for i,v in enumerate(text)}
                continue
            if not columns or len(cells)<max(columns.values())+1: continue
            daycell=cells[columns['Fieldwork date']]
            end=daycell.get('data-sort-value','') if daycell else ''
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',end): continue
            if not today-timedelta(days=185)<=date.fromisoformat(end)<=today: continue
            firmcell=cells[columns['Polling firm']]
            label=clean_cell(firmcell)
            if re.search(r'election|referendum|average|youtrend|europe elects',label,re.I): continue
            link=firmcell.find('a',href=re.compile(r'^https://'))
            if not link: continue
            rows=[]; valid=True
            for name,identifier in COLS.items():
                if name not in columns: continue
                cell=cells[columns[name]]
                raw=clean_cell(cell)
                if not raw or raw in ('–','—','-','�'): continue
                if int(cell.get('colspan',1))>1: valid=False; break
                value=number(raw)
                if value is None: valid=False; break
                rows.append(result(identifier,value))
            if not valid: continue
            start=None
            try:
                mw=json.loads(daycell.get('data-mw','{}'))
                template=next(p['template'] for p in mw['parts'] if isinstance(p,dict) and 'template' in p)
                params=template['params']; first=params['1']['wt']
                if first.isdigit():
                    startday=int(first); enddate=date.fromisoformat(end)
                    start=enddate.replace(day=startday).isoformat()
                    if start>end: start=None
            except (KeyError,StopIteration,ValueError): pass
            sample=re.sub(r'[^\d]','',text[columns['Sample size']])
            for entry in rows:
                if entry['party'] in ('azione','iv','altri'):
                    entry['basis']='wiki:'+entry['party']
            poll=finish({'pollster':label,'date':end,'dateType':'fieldwork',
                         'fieldworkStart':start,'fieldworkEnd':end,
                         'fieldworkLabel':text[columns['Fieldwork date']].replace('�','–'),
                         'sampleSize':int(sample) if sample else None,'publishedAt':None,
                         'source':{'name':'Fonte originale, indicizzata da Wikipedia','url':link['href'],
                                   'kind':'index','indexUrl':WIKI},'results':rows})
            if validate(poll,today): polls.append(poll)
    if len(polls)<5: raise ValueError('National polling table missing or incomplete')
    return polls

MONTHS={name:i+1 for i,name in enumerate(['gennaio','febbraio','marzo','aprile','maggio','giugno',
                                        'luglio','agosto','settembre','ottobre','novembre','dicembre'])}

def parse_swg_pdf(pdf_bytes,url):
    logging.getLogger('pypdf').setLevel(logging.ERROR)
    pages=[p.extract_text() or '' for p in PdfReader(io.BytesIO(pdf_bytes)).pages]
    page=next((p for p in reversed(pages) if 'Non si' in p and 'Fratelli' in p and 'Movimento' in p),None)
    if not page: raise ValueError('SWG voting intention page not found')
    return parse_swg_page(page,url)

def parse_swg_page(page,url):
    compact=re.sub(r'\s+','',page)
    match=re.search(r'Datediesecuzione:(\d{1,2})([a-z]*)[–−-](\d{1,2})([a-z]+)(20\d{2})',compact,re.I)
    if not match: raise ValueError('SWG fieldwork date unavailable')
    first,firstmonth,last,month,year=match.groups(); month=MONTHS[month.lower()]
    startmonth=MONTHS[firstmonth.lower()] if firstmonth else month
    startyear=int(year)-(1 if startmonth>month else 0)
    start=date(startyear,startmonth,int(first)).isoformat(); end=date(int(year),month,int(last)).isoformat()
    sample=re.search(r'nazionaledi([\d.]+)soggetti',compact)
    groups=[]; values=[]; labels=[]
    def flush():
        nonlocal values,labels
        if values or labels:
            if len(values)!=len(labels): raise ValueError('SWG layout changed: values/labels mismatch')
            for (identifier,label),value in zip(labels,values):
                entry=result(identifier,value,label if identifier in ('azione','iv') else None)
                if identifier in ('azione','iv'): entry['basis']=norm(label)
                groups.append(entry)
        values=[]; labels=[]
    capture=False
    for line in page.splitlines():
        line=line.strip()
        if line.startswith('Centrosinistra') and 'Centrodestra' in line: capture=True; continue
        if not capture: continue
        if re.search(r'Non\s*si',line): flush(); break
        if re.fullmatch(r'\d{1,2}[,.]\d',line):
            if labels: flush()
            values.append(number(line)); continue
        identifier=party_id(line)
        if identifier: labels.append((identifier,line))
    if not groups: raise ValueError('SWG chart could not be parsed')
    for entry in groups:
        if entry['party']=='altri':
            entry['basis']='swg-chart:'+entry['party']
    method=re.search(r'sondaggio([A-Z-]+)su',compact)
    publication=re.search(r'IntenzionidiVoto[–-]?(\d{1,2})([a-z]+)(20\d{2})',compact,re.I)
    published=date(int(publication[3]),MONTHS[publication[2].lower()],int(publication[1])).isoformat() if publication else None
    poll=finish({'pollster':'SWG','date':end,'dateType':'fieldwork','fieldworkStart':start,'fieldworkEnd':end,
                 'sampleSize':int(sample.group(1).replace('.','')) if sample else None,
                 'publishedAt':published,'method':method.group(1) if method else None,
                 'source':{'name':'SWG · PDF originale','url':url,'kind':'primary','indexUrl':SWG},'results':groups})
    if not validate(poll): raise ValueError('SWG chart failed numerical validation')
    return [poll]

def collect_swg():
    soup=BeautifulSoup(download(SWG),'html.parser')
    link=soup.find('a',href=re.compile(r'/attachment/.+\.pdf',re.I))
    if not link: raise ValueError('SWG PDF link missing')
    url=urllib.parse.urljoin(SWG,link['href'])
    return parse_swg_pdf(download(url),url)

def raw_answers(text):
    try:
        obj=json.loads(text); items=[]
        def walk(obj,label=''):
            if isinstance(obj,dict):
                for key,value in obj.items(): walk(value,key or label)
            elif isinstance(obj,(str,int,float)): items.append((label,str(obj)))
        walk(obj); return items
    except (json.JSONDecodeError,TypeError):
        items=[]
        for line in str(text).splitlines():
            match=re.match(r'^\s*[-•]?\s*(.+?)\s+(\d{1,2}(?:[,.]\d+)?)\s*%?(?:\s*\(.*)?$',line)
            if match: items.append(match.groups())
        return items

def parse_archive(text,today=None):
    today=today or date.today(); polls=[]
    for line in text.splitlines():
        row=json.loads(line)
        if row.get('national_poll')!=1: continue
        try: day=datetime.strptime(row['Data Inserimento'],'%d/%m/%Y').date()
        except (KeyError,ValueError): continue
        if not today-timedelta(days=100)<=day<=today: continue
        results=[]; seen=set()
        for label,raw in raw_answers(row.get('text','')):
            identifier=party_id(label); value=number(raw)
            if identifier and identifier not in seen and value is not None:
                results.append(result(identifier,value)); seen.add(identifier)
        poll=finish({'pollster':row.get('Realizzatore',''),'date':day.isoformat(),'dateType':'deposit',
                     'depositedAt':day.isoformat(),'fieldworkStart':None,'fieldworkEnd':None,
                     'sampleSize':None,'publishedAt':None,'title':row.get('Titolo',''),
                     'commissioner':row.get('Committente',''),
                     'source':{'name':'Archivio del registro ufficiale · ruggsea / onData (CC BY 4.0)',
                               'url':REGISTRY,'kind':'archive','indexUrl':ARCHIVE_PAGE},'results':results})
        if validate(poll,today): polls.append(poll)
    if not polls: raise ValueError('Registry archive contains no valid recent polls')
    return polls

def signature(poll):
    """Use major-party figures to match deposits to their already indexed poll."""
    return tuple(sorted((r['party'],r['value']) for r in poll['results'] if r['party'] in {'fdi','pd','m5s','fi','lega','avs','fn'}))

def merge_polls(previous,incoming,today=None):
    today=today or date.today(); by_id={}
    rank={'primary':3,'index':2,'archive':1}
    for poll in previous+incoming:
        if not validate(poll,today): continue
        if date.fromisoformat(poll['date'])<today-timedelta(days=370): continue
        old=by_id.get(poll['id'])
        if not old or rank[poll['source']['kind']]>=rank[old['source']['kind']]: by_id[poll['id']]=poll
    polls=list(by_id.values()); filtered=[]
    for poll in polls:
        if poll['dateType']=='deposit' and any(
            p['dateType']=='fieldwork' and p['pollster']==poll['pollster'] and signature(p)==signature(poll)
            and 0<=(date.fromisoformat(poll['date'])-date.fromisoformat(p['date'])).days<=14 for p in polls): continue
        filtered.append(poll)
    return sorted(filtered,key=lambda p:(p['date'],rank[p['source']['kind']],p['pollster']),reverse=True)[:600]

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--output',default='polls.json'); args=parser.parse_args()
    path=Path(args.output)
    previous=json.loads(path.read_text(encoding='utf8')) if path.exists() else {'polls':[]}
    jobs={'swg':collect_swg,'wikipedia':lambda:parse_wikipedia(download(WIKI).decode('utf8')),
          'registry_archive':lambda:parse_archive(download(ARCHIVE).decode('utf8'))}
    incoming=[]; statuses=[]; now=datetime.now(timezone.utc).isoformat()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(fn):name for name,fn in jobs.items()}
        for future in concurrent.futures.as_completed(futures):
            name=futures[future]
            try:
                found=future.result(); incoming.extend(found)
                statuses.append({'id':name,'ok':True,'count':len(found),'checkedAt':now})
            except Exception as error:
                print(f'::warning::{name}: {type(error).__name__}: {error}')
                statuses.append({'id':name,'ok':False,'count':0,'checkedAt':now})
    if not incoming: raise SystemExit('All polling sources failed; existing polls.json remains untouched')
    polls=merge_polls(previous.get('polls',[]),incoming)
    if not polls: raise SystemExit('No valid polls; refusing to replace archive')
    data={'schemaVersion':1,'success':True,'updatedAt':now,'checkedAt':now,
          'refreshHours':2,'sources':sorted(statuses,key=lambda x:x['id']),
          'coverage':'Sondaggi nazionali pubblicati: SWG diretto, indice Wikipedia con fonti originali e archivio dei depositi del registro.',
          'polls':polls}
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.tmp'); temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    temporary.replace(path)
    print(f'{len(polls)} valid polls, {len(incoming)} collected; latest {polls[0]["pollster"]} {polls[0]["date"]}')

if __name__=='__main__': main()
