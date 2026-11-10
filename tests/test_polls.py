import importlib.util
import json
import unittest
from datetime import date
from pathlib import Path

spec=importlib.util.spec_from_file_location('polls',Path(__file__).parents[1]/'scripts/update-polls.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
TODAY=date(2026,11,10)

def poll(day='2026-11-09',kind='fieldwork',source='index'):
    return m.finish({'date':day,'dateType':kind,'pollster':'SWG srl',
                     'source':{'kind':source,'url':'https://example.com/poll'},
                     'results':[m.result(k,v) for k,v in [('fdi',29),('pd',21),('m5s',13),('fi',8),('lega',6),('avs',7),('altri',16)]]})

class PollTests(unittest.TestCase):
    def test_refuses_partial_future_and_duplicate_party_data(self):
        p=poll();self.assertTrue(m.validate(p,TODAY))
        p['results'].pop();self.assertFalse(m.validate(p,TODAY))
        p=poll('2026-11-11');self.assertFalse(m.validate(p,TODAY))
        p=poll();p['results'][-1]['party']='fdi';self.assertFalse(m.validate(p,TODAY))

    def test_no_normalization_of_invalid_totals(self):
        p=poll();p['results'][0]['value']=55;self.assertFalse(m.validate(p,TODAY))

    def test_last_good_and_primary_priority(self):
        original=poll(source='primary');updated=poll(source='index')
        broken=poll('2026-11-08');broken['results']=[]
        merged=m.merge_polls([original],[updated,broken],TODAY)
        self.assertEqual(len(merged),1);self.assertEqual(merged[0]['source']['kind'],'primary')

    def test_deposit_is_not_a_second_poll(self):
        self.assertEqual(len(m.merge_polls([poll('2026-11-07')],[poll(kind='deposit',source='archive')],TODAY)),1)

    def test_deposit_date_not_invented_as_fieldwork(self):
        raw={'Data Inserimento':'09/11/2026','Realizzatore':'Only Numbers','national_poll':1,
             'text':json.dumps({"Fratelli d'Italia":29,'Partito Democratico':21,'Movimento 5 Stelle':13,
                               'Forza Italia':8,'Lega':6,'Alleanza Verdi Sinistra':7,'Altri':16})}
        parsed=m.parse_archive(json.dumps(raw),TODAY)[0]
        self.assertEqual(parsed['dateType'],'deposit');self.assertIsNone(parsed['fieldworkEnd'])

    def test_metadata_is_not_parsed_as_party(self):
        self.assertIsNone(m.party_id('INDECISI - ASTENSIONE'))
        self.assertIsNone(m.party_id('CENTRODESTRA'))

    def test_swg_grouped_chart_and_cross_month_dates(self):
        page='''Intenzioni di Voto 2 novembre 2026
Date di esecuzione: 28 ottobre – 2 novembre 2026.
Metodo di rilevazione: sondaggio CATI-CAMI-CAWI su un campione rappresentativo nazionale di 1.200 soggetti maggiorenni.
Centrosinistra 44,9 -0,1 Centrodestra 44,0 +0,2
21,0
13,0
7,0
Partito Democratico
Movimento 5 Stelle
Alleanza Verdi-Sinistra
29,0
8,0
6,0
Fratelli d’Italia
Forza Italia
Lega
Fuori dalle coalizioni
16,0
altro partito
Non si esprime 29%
'''
        parsed=m.parse_swg_page(page,'https://www.swg.it/poll.pdf')[0]
        self.assertEqual(parsed['fieldworkStart'],'2026-10-28')
        self.assertEqual(parsed['fieldworkEnd'],'2026-11-02')
        self.assertEqual(parsed['sampleSize'],1200)
        self.assertEqual(sum(r['value'] for r in parsed['results']),100)
        with self.assertRaises(ValueError):m.parse_swg_page(page.replace('29,0','39,0'),'https://www.swg.it/poll.pdf')

    def test_color_header_row_keeps_party_columns(self):
        head='<tr>'+''.join('<th rowspan="2">'+x+'</th>' for x in ['Fieldwork date','Polling firm','Sample size'])+''.join('<th>'+x+'</th>' for x in ['FdI','PD','M5S','FI','Lega','AVS','Others'])+'</tr>'
        colors='<tr>'+('<th></th>'*7)+'</tr>'
        row='<tr><td data-sort-value="2026-11-09">4–9 Nov</td><td><a href="https://example.com/poll">SWG</a></td><td>1,200</td>'+''.join('<td>'+str(x)+'</td>' for x in [29,21,13,8,6,7,16])+'</tr>'
        parsed=m.parse_wikipedia('<table class="wikitable">'+head+colors+row*5+'</table>',TODAY)
        self.assertEqual(len(parsed),5);self.assertEqual(parsed[0]['sampleSize'],1200)
        self.assertEqual(next(r['value'] for r in parsed[0]['results'] if r['party']=='fdi'),29)

if __name__=='__main__':unittest.main()
