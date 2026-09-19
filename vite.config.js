import {defineConfig} from 'vite';
import fs from 'node:fs';
export default defineConfig({base:process.env.GITHUB_ACTIONS?'/fly-assist/':'/',plugins:[{name:'local-demo-export',apply:'serve',configureServer(server){server.middlewares.use('/__save-demo',async(req,res)=>{
if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:8846'){res.writeHead(403);return res.end();}
try{const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>50000000)throw Error('too large');chunks.push(c);}fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/demo.webm',Buffer.concat(chunks));res.writeHead(200);res.end('Saved');}catch{res.writeHead(400);res.end('Export failed');}
});}},{name:'public-security-policy',apply:'build',transformIndexHtml(html){return html.replace('<meta charset="UTF-8">',`<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.x.ai; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'">`);}}]});
