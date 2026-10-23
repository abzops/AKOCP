// Local full backup helper. No credentials are embedded or printed.
// Set AKOCP_DATABASE_URL and AKOCP_SERVICE_ROLE_KEY in your private environment.
// Requires PostgreSQL pg_dump on PATH (or AKOCP_PG_DUMP pointing to its executable).
import {createClient} from '@supabase/supabase-js'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,relative,join,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'

const base=resolve(fileURLToPath(new URL('../.private-backups/',import.meta.url)))
const hash=data=>createHash('sha256').update(data).digest('hex')
const localFile=(root,path)=>{
  const full=resolve(root,path),rel=relative(root,full)
  if(rel.startsWith('..')||isAbsolute(rel)||resolve(root)===full)throw new Error('Invalid backup file path')
  return full
}
async function verify(root){
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'))
  if(manifest.format!=='akocp-full-backup-v1'||!manifest.complete)throw new Error('Backup is incomplete')
  if(!manifest.files.some(file=>file.path==='database.dump'))throw new Error('Database dump is missing')
  if((await readFile(join(root,'database.dump'))).subarray(0,5).toString()!=='PGDMP')throw new Error('Database dump format is invalid')
  for(const file of manifest.files){
    const data=await readFile(localFile(root,file.path))
    if(data.length!==file.bytes||hash(data)!==file.sha256)throw new Error('Backup integrity check failed')
  }
  console.log(JSON.stringify({verified:true,files:manifest.files.length,containsDatabaseDump:true,containsStorageObjects:true}))
}
async function backup(){
  if(!process.env.AKOCP_DATABASE_URL||!process.env.AKOCP_SERVICE_ROLE_KEY){
    throw new Error('Configure AKOCP_DATABASE_URL and AKOCP_SERVICE_ROLE_KEY privately before running. Do not paste them into chat.')
  }
  const root=join(base,`full-${new Date().toISOString().replace(/[:.]/g,'-')}`)
  await mkdir(join(root,'objects'),{recursive:true})
  const manifest={format:'akocp-full-backup-v1',project:'cqptdpkhaiomitwzjysp',createdAt:new Date().toISOString(),complete:false,buckets:[],files:[]}
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2))
  await new Promise((done,fail)=>{
    const child=spawn(process.env.AKOCP_PG_DUMP||'pg_dump',['--format=custom','--no-owner','--no-privileges','--file',join(root,'database.dump')],{env:{...process.env,PGDATABASE:process.env.AKOCP_DATABASE_URL},stdio:'ignore',windowsHide:true})
    child.on('error',()=>fail(new Error('pg_dump could not start. Install PostgreSQL tools or configure AKOCP_PG_DUMP.')))
    child.on('exit',code=>code===0?done():fail(new Error('Database dump failed. Check the private database connection configuration.')))
  })
  const dump=await readFile(join(root,'database.dump'))
  manifest.files.push({path:'database.dump',bytes:dump.length,sha256:hash(dump)})
  const client=createClient('https://cqptdpkhaiomitwzjysp.supabase.co',process.env.AKOCP_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const buckets=await client.storage.listBuckets()
  if(buckets.error)throw new Error('Could not list Storage buckets. Verify the private backup credential.')
  manifest.buckets=buckets.data
  async function copyPrefix(bucket,prefix=''){
    for(let offset=0;;){
      const result=await client.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}})
      if(result.error)throw new Error('Storage listing failed. Backup remains incomplete.')
      if(!result.data.length)break
      for(const object of result.data){
        const key=prefix?`${prefix}/${object.name}`:object.name
        if(!object.id){await copyPrefix(bucket,key);continue}
        const download=await client.storage.from(bucket).download(key)
        if(download.error)throw new Error('Storage download failed. Backup remains incomplete.')
        const data=Buffer.from(await download.data.arrayBuffer()),path=`objects/${hash(`${bucket}/${key}`)}.bin`
        await writeFile(join(root,path),data)
        manifest.files.push({path,bucket,key,bytes:data.length,sha256:hash(data)})
      }
      offset+=result.data.length
    }
  }
  for(const bucket of buckets.data)await copyPrefix(bucket.id)
  manifest.complete=true
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2))
  await verify(root)
  console.log(`Saved privately: ${root}`)
}
try{if(process.argv[2]==='--verify')await verify(resolve(process.argv[3]||base));else await backup()}
catch(error){console.error(error instanceof Error?error.message:'Backup failed');process.exitCode=1}
