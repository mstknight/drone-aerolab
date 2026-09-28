"""Loopback-only CFD job API. Start: python3 cfd/server.py"""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from threading import Thread, Lock
import json, uuid
from case import generate
from runner import runtime, run
ROOT=Path(__file__).resolve().parent/'runs';ROOT.mkdir(exist_ok=True)
lock=Lock(); jobs={}; active=None; result_mtimes={}
# Restore completed computations so reopening the UI does not hide real results.
for result_file in sorted(ROOT.glob('*/result.json'),key=lambda p:p.stat().st_mtime):
    try:
        data=json.loads(result_file.read_text())
        job_id=result_file.parent.name
        jobs[job_id]={'id':job_id,'status':'complete','stage':'complete','result':data}
    except (OSError,ValueError):pass

def worker(job_id):
    global active
    def stage(value):
        with lock: jobs[job_id]['stage']=value
    try:
        result=run(ROOT/job_id,stage)
        with lock:jobs[job_id].update(status='complete',result=result)
    except Exception as e:
        with lock:jobs[job_id].update(status='failed',error=str(e))
    finally:
        with lock:active=None

class Handler(BaseHTTPRequestHandler):
    def reply(self, data, status=200):
        raw=json.dumps(data,ensure_ascii=False,allow_nan=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def allowed(self):
        # No cross-origin writes, remote Host headers or external callers.
        host=self.headers.get('Host','').split(':')[0]
        origin=self.headers.get('Origin')
        return host in ('127.0.0.1','localhost') and (not origin or origin in ('http://127.0.0.1:5174','http://localhost:5174','http://127.0.0.1:5173','http://localhost:5173'))
    def do_GET(self):
        if not self.allowed():return self.reply({'error':'Local origin required'},403)
        if self.path in ('/api/cfd/status','/api/cfd/studies'):
            with lock:
                for file in sorted(ROOT.glob('*/result.json'),key=lambda p:p.stat().st_mtime):
                    try:
                        if file.parent.name!=active and result_mtimes.get(file.parent.name)!=file.stat().st_mtime_ns:
                            data=json.loads(file.read_text())
                            jobs[file.parent.name]={'id':file.parent.name,'status':'complete','stage':'complete','result':data}
                            result_mtimes[file.parent.name]=file.stat().st_mtime_ns
                    except (OSError,ValueError):pass
            if self.path=='/api/cfd/studies':
                with lock:
                    rows=[{'id':j['id'],'mesh':j['result']['configuration']['mesh'],'speed':j['result']['configuration']['speedMs'],'cells':j['result']['configuration']['cells'],'family':j['result']['configuration'].get('meshFamily','uniform-v1'),'converged':j['result']['converged'],'Cd':j['result']['latest'].get('Cd'),'Cl':j['result']['latest'].get('Cl'),'yPlus':j['result'].get('bodyYPlus'),'variation':j['result'].get('last50CdRelativeRange')} for j in jobs.values() if j.get('result')]
                return self.reply(rows)
        if self.path=='/api/cfd/status':return self.reply({**runtime(),'activeJob':active,'latestJob':next(reversed(jobs),None),'case':'简化长方体基准 · 非 BMW','validated':False})
        parts=self.path.split('/')
        if len(parts) in (5,6) and parts[1:4]==['api','cfd','jobs']:
            job_id=parts[4]
            with lock:job=dict(jobs.get(job_id,{}))
            if not job:return self.reply({'error':'Job not found'},404)
            if len(parts)==6 and parts[5]=='fields':
                p=ROOT/job_id/'fields.json'
                if not p.exists():return self.reply({'error':'场数据尚未导出'},409)
                return self.reply(json.loads(p.read_text()))
            if len(parts)==6 and parts[5]=='download':
                p=ROOT/job_id/'results.zip'
                if job['status']!='complete' or not p.exists():return self.reply({'error':'No completed result'},409)
                data=p.read_bytes();self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Disposition','attachment; filename="aerolab-'+job_id+'.zip"');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
            logs=sorted((ROOT/job_id).glob('log.*'),key=lambda p:p.stat().st_mtime)
            job['logTail']=logs[-1].read_text(errors='replace')[-5000:] if logs else ''
            return self.reply(job)
        return self.reply({'error':'Not found'},404)
    def do_POST(self):
        global active
        if not self.allowed():return self.reply({'error':'Local origin required'},403)
        if self.path!='/api/cfd/jobs':return self.reply({'error':'Not found'},404)
        if not self.headers.get('Content-Type','').startswith('application/json'):return self.reply({'error':'JSON required'},415)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4096:raise ValueError('Invalid request size')
            config=json.loads(self.rfile.read(size))
            if not isinstance(config,dict) or set(config)-{'speed','iterations','mesh'}:raise ValueError('Invalid parameters')
            with lock:
                if active:return self.reply({'error':'已有计算正在运行'},409)
                env=runtime()
                if not env['ready']:return self.reply({'error':env['message']},503)
                job_id=uuid.uuid4().hex
                generate(ROOT/job_id,**config)
                jobs[job_id]={'id':job_id,'status':'running','stage':'queued'};active=job_id
            Thread(target=worker,args=(job_id,),daemon=True).start();return self.reply({'id':job_id},202)
        except (ValueError,TypeError) as e:return self.reply({'error':str(e)},400)

if __name__=='__main__':
    print('CFD API: http://127.0.0.1:8008',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8008),Handler).serve_forever()
