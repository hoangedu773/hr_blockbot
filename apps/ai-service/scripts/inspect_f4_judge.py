"""Read-only known-loopback metadata inventory. Never inference/key lookup/pull."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import httpx
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.prepare_f4 import resources


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    if args.output.exists():raise FileExistsError('Keep earlier evidence')
    report={'scope':'read-only metadata inventory; no inference or credentials',
            'commands':{name:shutil.which(name) is not None for name in ('ollama','lms','llama-server')},
            'resources':resources(Path('D:/hr-blockbot-f4-cache')),'endpoints':[],
            'cloudProviders':'Source adapters exist; no live configuration/keys inspected, Atlas forbidden'}
    with httpx.Client(trust_env=False,follow_redirects=False,timeout=1) as client:
        for origin,path in [('http://127.0.0.1:11434','/api/tags'),('http://127.0.0.1:1234','/api/v1/models'),
                            ('http://127.0.0.1:1234','/v1/models'),('http://127.0.0.1:8080','/v1/models')]:
            item={'origin':origin,'path':path}
            try:
                response=client.get(origin+path);item['status']=response.status_code
                if response.status_code==200:
                    body=response.json();rows=body.get('models',body.get('data',[]))
                    item['models']=[{'name':row.get('name',row.get('id',row.get('key'))),'type':row.get('type'),'digest':row.get('digest')}
                                    for row in rows if type(row) is dict]
            except Exception as error:item['unavailableType']=type(error).__name__
            report['endpoints'].append(item)
    with args.output.open('x',encoding='utf-8') as handle:json.dump(report,handle,ensure_ascii=False,indent=2)
    print(json.dumps(report),flush=True)


if __name__=='__main__':main()
